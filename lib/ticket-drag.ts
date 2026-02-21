import type { DragEvent } from "react";

const DRAGGING_CLASS = "kb-ticket-dragging";

export const beginTicketDrag = (
  event: DragEvent<HTMLElement>,
  dragRoot: HTMLElement
) => {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    selection.removeAllRanges();
  }

  document.body.classList.add(DRAGGING_CLASS);

  const rect = dragRoot.getBoundingClientRect();
  const offsetX = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
  const offsetY = Math.max(0, Math.min(event.clientY - rect.top, rect.height));

  event.dataTransfer.setDragImage(dragRoot, offsetX, offsetY);
};

export const endTicketDrag = () => {
  document.body.classList.remove(DRAGGING_CLASS);
};
