"""Orchestration de l'agent de régulation agricole (LangChain).

Flux général :
1. L'utilisateur pose une question.
2. L'agent (LLM Mistral) décide d'appeler l'outil le plus adapté :
   - `recherche_reglementation_agricole` (RAG hybride Qdrant) pour la
     réglementation déjà indexée localement ;
   - `recherche_aides_financieres_agricoles` (recherche web ciblée + extraction
     structurée) pour trouver des aides, subventions ou appels à projets ;
   - `recherche_web_aides_agricoles` (recherche web générale) pour les autres
     informations récentes ou nouveautés non couvertes par les deux outils
     précédents.
3. Les résultats retrouvés sont renvoyés à l'agent, qui reformule une réponse
   claire et sourcée pour l'utilisateur.
"""

import time

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_mistralai import ChatMistralAI

from app.config.settings import get_settings
from app.schemas.chat import ChatHistoryMessage
from app.tools.rag_tool import recherche_reglementation_agricole
from app.tools.subsidy_tool import recherche_aides_financieres_agricoles
from app.tools.web_search_tool import recherche_web_aides_agricoles

SYSTEM_PROMPT = (
    "Tu es l'agent de régulation d'une plateforme d'assistance aux agriculteurs.\n\n"
    "ORDRE DES OUTILS : appelle TOUJOURS `recherche_reglementation_agricole` en "
    "premier (base réglementaire officielle, passages préfixés [R1], [R2]...). "
    "Si la question porte sur une aide financière, une subvention ou un appel à "
    "projets (ex. 'quelles aides pour...', 'quel financement pour...'), appelle "
    "aussi `recherche_aides_financieres_agricoles` (résultats préfixés [S1], "
    "[S2]...) — c'est l'outil le plus adapté pour ce type de question, à "
    "privilégier sur la recherche web générale. N'appelle "
    "`recherche_web_aides_agricoles` (résultats préfixés [W1], [W2]...) que pour "
    "les autres actualités/nouveautés non couvertes par les deux outils "
    "précédents. Si [R] (ou [S] pour une question d'aide) répond déjà pleinement "
    "à la question, n'appelle PAS l'outil web général — cela ne ferait qu'ajouter "
    "du bruit et des sources moins fiables.\n\n"
    "RÈGLE ABSOLUE : n'utilise QUE les faits, montants, dates et références "
    "présents mot pour mot dans les passages renvoyés par les outils. N'ajoute "
    "jamais un chiffre, une date, un arrêté, un site ou un organisme qui ne figure "
    "pas explicitement dans ces passages, même si tu penses le savoir par "
    "ailleurs. Si plusieurs passages [R]/[S] (sources officielles) se "
    "contredisent entre eux, ou si un résultat [W] non officiel contredit un "
    "passage [R]/[S] officiel, signale la contradiction explicitement et donne "
    "la priorité à la source officielle plutôt qu'à une source web non "
    "officielle. Si les résultats ne répondent pas à la question, dis-le "
    "clairement plutôt que de compléter avec tes propres connaissances.\n\n"
    "Réponds en français, de façon claire et concise. Les préfixes [R1], [S2], "
    "[W3] etc. servant à repérer les passages sont un outil INTERNE pour toi — "
    "ne les recopie JAMAIS tels quels dans ta réponse. Pour citer une source "
    "dans le corps du texte, utilise plutôt une référence lisible entre "
    "parenthèses, construite à partir de la ligne 'Certifié par : ...' du "
    "passage [R] (ex. '(Legifrance, Arrêté du 30 septembre 2025)'), ou à partir "
    "de l'organisme/domaine du passage [S] ou [W] (ex. '(FranceAgriMer)', "
    "'(agriculture.gouv.fr)', '(Ministère de l'Agriculture)'). Si plusieurs "
    "phrases consécutives viennent de la même source, ne répète pas la "
    "référence à chaque phrase — cite-la une fois pour le paragraphe.\n\n"
    "CERTIFICATION : termine systématiquement ta réponse par une ligne "
    "'Cette information est certifiée par : <source(s)>'. Cette ligne doit "
    "contenir UNIQUEMENT des noms de sources lisibles par un humain (ex. "
    "'Legifrance', 'Ministère de l'Agriculture', 'FranceAgriMer'), séparés par "
    "des virgules, SANS AUCUN crochet ni code [R..]/[W..] — ces codes ne servent "
    "qu'aux citations dans le corps de la réponse, jamais dans cette ligne finale. "
    "Déduplique les noms de sources identiques. Ne cite dans cette ligne QUE les "
    "sources marquées 'Certifié par' (passages [R]) ou 'Source officielle' "
    "(passages [S] ou [W]). Ne mentionne jamais dans cette ligne une source marquée "
    "'Source non officielle (à vérifier)' — tu peux en revanche en parler dans "
    "le corps de la réponse en la signalant explicitement comme non officielle. "
    "Si aucune source officielle n'a été utilisée, écris 'Aucune source "
    "officielle disponible pour cette réponse — à vérifier'.\n"
    "Exemple de ligne finale attendue : "
    "'Cette information est certifiée par : Legifrance, Ministère de "
    "l'Agriculture.'\n\n"
    "LIENS : juste après la ligne de certification, ajoute une section "
    "'Sources :' listant, à la ligne, chaque référence citée dans le corps du "
    "texte avec son lien exact, SEULEMENT si une ligne 'URL : ...' est présente "
    "dans le passage [R]/[S]/[W] correspondant — ne fabrique jamais une URL qui "
    "n'est pas fournie telle quelle, et n'inclus pas de ligne pour une référence "
    "sans URL disponible. Reprends le même libellé que la référence utilisée "
    "entre parenthèses dans le corps du texte, pour que le lien soit "
    "facilement rattaché à sa mention. Format : '- <référence> : <URL>'.\n"
    "Exemple :\n"
    "Sources :\n"
    "- Legifrance, Arrêté du 30 septembre 2025 : "
    "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000052372817\n"
    "- FranceAgriMer : https://www.franceagrimer.fr/aides/exemple"
)

TOOLS = [recherche_reglementation_agricole, recherche_aides_financieres_agricoles, recherche_web_aides_agricoles]


class RegulationAgent:
    """Agent principal de régulation : recherche réglementaire + reformulation LLM."""

    def __init__(self) -> None:
        settings = get_settings()
        api_key = settings.mistral_api_key
        model_name = settings.mistral_model
        self._tool_selection_llm = ChatMistralAI(
            model=model_name,
            api_key=api_key,
            temperature=0,
        )
        self._final_answer_llm = ChatMistralAI(
            model=model_name,
            api_key=api_key,
            temperature=0,
        )
        self._llm_with_tools = self._tool_selection_llm.bind_tools(TOOLS)
        self._tools_by_name = {t.name: t for t in TOOLS}

    def answer(
        self,
        question: str,
        history: list[ChatHistoryMessage] | None = None,
        memories: list[str] | None = None,
    ) -> str:
        """Répond à une question utilisateur en s'appuyant sur le RAG réglementaire.

        Args:
            question: La question courante de l'utilisateur.
            history: Historique des échanges précédents (multi-tour).
            memories: Mémoires persistantes de l'utilisateur injectées dans le contexte.
        """
        total_start = time.perf_counter()

        # Construction du système prompt avec mémoires injectées
        system_content = SYSTEM_PROMPT
        if memories:
            memories_block = "\n".join(f"- {m}" for m in memories)
            system_content = (
                f"{SYSTEM_PROMPT}\n\n"
                f"MÉMOIRES PERSISTANTES DE L'UTILISATEUR (utilise-les comme contexte "
                f"supplémentaire pour personnaliser ta réponse) :\n{memories_block}"
            )

        messages: list = [SystemMessage(content=system_content)]

        # Injection de l'historique multi-tour
        if history:
            for msg in history[:-1]:  # Exclure le message courant (déjà dans `question`)
                if msg.role == "user":
                    messages.append(HumanMessage(content=msg.text))
                else:
                    messages.append(AIMessage(content=msg.text))

        # Message courant
        messages.append(HumanMessage(content=question))

        step_start = time.perf_counter()
        ai_message = self._llm_with_tools.invoke(messages)
        print(f"[PERF] LLM tool selection: {time.perf_counter() - step_start:.2f}s")
        messages.append(ai_message)

        for tool_call in ai_message.tool_calls:
            tool_result = self._tools_by_name[tool_call["name"]].invoke(tool_call["args"])
            messages.append(ToolMessage(content=tool_result, tool_call_id=tool_call["id"]))

        if ai_message.tool_calls:
            step_start = time.perf_counter()
            final_message = self._final_answer_llm.invoke(messages)
            print(f"[PERF] LLM final answer: {time.perf_counter() - step_start:.2f}s")
            result = final_message.content
        else:
            result = ai_message.content

        print(f"[PERF] TOTAL: {time.perf_counter() - total_start:.2f}s")
        return result
