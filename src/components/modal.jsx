import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

export function Modal({ title, children, onClose, wide = false }) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={wide ? "wide" : ""}
        aria-describedby={undefined}
      >
        <header className="modal-header">
          <DialogTitle>{title}</DialogTitle>
        </header>
        {children}
      </DialogContent>
    </Dialog>
  );
}
