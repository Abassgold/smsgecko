'use client';

import { Modal } from './modal';
import { Button } from './button';

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Confirm',
  destructive,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body?: string;
  confirmLabel?: string;
  destructive?: boolean;
  pending?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      {body ? <p className="text-sm text-muted">{body}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={pending}
          className={destructive ? 'bg-danger text-white hover:bg-danger' : undefined}
        >
          {pending ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
