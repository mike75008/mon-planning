export async function exportRecapAsPng({ title, items, periodLabel }) {
  const width = 1080;
  const height = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0B0D10";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#64748B";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText("SÉRIE VIVANTE", 60, 80);

  ctx.fillStyle = "#3B82F6";
  ctx.font = "bold 48px sans-serif";
  wrapText(ctx, title, 60, 160, width - 120, 56);

  ctx.fillStyle = "#94A3B8";
  ctx.font = "24px sans-serif";
  ctx.fillText(periodLabel, 60, 280);

  const cols = 2;
  const cellW = (width - 180) / cols;
  const cellH = 320;
  let x = 60;
  let y = 340;
  let col = 0;

  for (const item of items.slice(0, 8)) {
    ctx.fillStyle = "#14171B";
    ctx.strokeStyle = item.color || "#22262D";
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, cellW, cellH, 16);
    ctx.fill();
    ctx.stroke();

    if (item.type === "photo" && item.url) {
      try {
        const img = await loadImage(item.url);
        const ratio = Math.min((cellW - 20) / img.width, (cellH - 80) / img.height);
        const iw = img.width * ratio;
        const ih = img.height * ratio;
        ctx.drawImage(img, x + (cellW - iw) / 2, y + 12, iw, ih);
      } catch {
        drawPlaceholder(ctx, x, y, cellW, cellH, "Photo");
      }
    } else {
      drawPlaceholder(ctx, x, y, cellW, cellH, item.type === "video" ? "Vidéo" : "Lien");
    }

    ctx.fillStyle = "#E7E9EC";
    ctx.font = "20px sans-serif";
    wrapText(ctx, item.blockLabel || "", x + 12, y + cellH - 52, cellW - 24, 24);

    col++;
    if (col >= cols) {
      col = 0;
      x = 60;
      y += cellH + 24;
    } else {
      x += cellW + 24;
    }
  }

  ctx.fillStyle = "#64748B";
  ctx.font = "22px sans-serif";
  ctx.fillText(`${items.length} pièce(s) jointe(s)`, 60, height - 80);

  const link = document.createElement("a");
  link.download = `serie-vivante-${Date.now()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = (text || "").split(" ");
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, cy);
      line = word + " ";
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line.trim(), x, cy);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPlaceholder(ctx, x, y, w, h, label) {
  ctx.fillStyle = "#1E2127";
  ctx.fillRect(x + 12, y + 12, w - 24, h - 70);
  ctx.fillStyle = "#64748B";
  ctx.font = "22px sans-serif";
  ctx.fillText(label, x + 24, y + h / 2);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
