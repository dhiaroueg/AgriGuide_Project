"""Evaluate the pretrained and fine-tuned BreizhCrops TempCNN models on frh04."""
import argparse
from pathlib import Path

import pandas as pd
import sklearn.metrics
import torch
from torch.utils.data import DataLoader

import breizhcrops
from breizhcrops.models.pretrained import pretrained as load_pretrained


def metrics(y_true, y_pred):
    return dict(
        accuracy=sklearn.metrics.accuracy_score(y_true, y_pred),
        kappa=sklearn.metrics.cohen_kappa_score(y_true, y_pred),
        f1_macro=sklearn.metrics.f1_score(y_true, y_pred, average="macro", zero_division=0),
        f1_weighted=sklearn.metrics.f1_score(y_true, y_pred, average="weighted", zero_division=0),
    )


def evaluate(model, loader, device):
    model.eval()
    y_true_all, y_pred_all = [], []
    with torch.no_grad():
        for x, y_true, _ in loader:
            logits = model(x.to(device))
            y_true_all.append(y_true)
            y_pred_all.append(logits.argmax(-1).cpu())
    return metrics(torch.cat(y_true_all), torch.cat(y_pred_all))


def main():
    project_root = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser()
    ap.add_argument("--datapath", default="./breizhcrops_dataset")
    ap.add_argument("--level", default="L1C", help="L1C is required by the pretrained 13-band model")
    ap.add_argument("--finetuned", default=str(project_root / "dl_checkpoints" / "tempcnn_finetuned.pth"))
    ap.add_argument("--batchsize", type=int, default=256)
    ap.add_argument("--workers", type=int, default=0)
    ap.add_argument("--device", default=None)
    ap.add_argument("--out", default="dl_eval_results.csv")
    args = ap.parse_args()

    device = torch.device(args.device or ("cuda" if torch.cuda.is_available() else "cpu"))
    print(f"device: {device}")

    val_ds = breizhcrops.BreizhCrops(region="frh04", root=args.datapath, level=args.level)
    val_loader = DataLoader(
        val_ds, batch_size=args.batchsize, shuffle=False, num_workers=args.workers
    )
    print(f"frh04 samples: {len(val_ds)} | classes: {list(val_ds.classname)}")

    print("\nEvaluating pretrained checkpoint (no fine-tuning)...")
    pretrained_model = load_pretrained("tempcnn", device=device)
    pretrained_scores = evaluate(pretrained_model, val_loader, device)
    print("Pretrained:", pretrained_scores)

    print("\nEvaluating fine-tuned checkpoint...")
    finetuned_model = load_pretrained("tempcnn", device=device)
    checkpoint = torch.load(args.finetuned, map_location=device)
    if "model_state" not in checkpoint:
        raise KeyError(f"Checkpoint {args.finetuned} has no 'model_state' entry")
    finetuned_model.load_state_dict(checkpoint["model_state"])
    finetuned_scores = evaluate(finetuned_model, val_loader, device)
    print("Fine-tuned:", finetuned_scores)

    df = pd.DataFrame(
        {
            "Pretrained BreizhCrops checkpoint": pretrained_scores,
            "Fine-tuned (this project)": finetuned_scores,
        }
    ).T.rename(
        columns={
            "accuracy": "Accuracy",
            "kappa": "Kappa",
            "f1_macro": "F1 (macro)",
            "f1_weighted": "F1 (weighted)",
        }
    )
    df.to_csv(args.out)
    print(f"\nSaved to {args.out}")
    print(df.round(3))


if __name__ == "__main__":
    main()