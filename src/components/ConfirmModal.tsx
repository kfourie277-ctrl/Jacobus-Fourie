import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Are you absolutely sure?",
  message = "This action cannot be undone. This will permanently delete the selected item and all of its associated data.",
  confirmText = "Delete Permanently",
  cancelText = "Cancel",
  isLoading = false
}: ConfirmModalProps) {
  
  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isLoading]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (!isLoading) onClose();
            }}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", duration: 0.4 }}
            className="relative w-full max-w-md bg-white rounded-3xl border border-slate-100 shadow-2xl overflow-hidden z-10"
          >
            {/* Visual Header Grid Accent Pattern */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#cc0000]" />

            {/* Close Button */}
            {!isLoading && (
              <button
                type="button"
                onClick={onClose}
                className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            )}

            {/* Main Content Body */}
            <div className="p-6 pt-8 text-center sm:text-left sm:flex sm:items-start sm:gap-4.5">
              {/* Warning Badge Icon */}
              <div className="mx-auto sm:mx-0 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-[#cc0000] border border-red-100 mb-4 sm:mb-0">
                <AlertTriangle className="h-6 w-6" />
              </div>

              {/* Text Blocks */}
              <div className="flex-1 mt-1 text-center sm:text-left">
                <h3 className="text-xl font-bold text-slate-900 tracking-tight leading-6">
                  {title}
                </h3>
                <p className="mt-2.5 text-sm text-slate-500 font-medium leading-relaxed">
                  {message}
                </p>
              </div>
            </div>

            {/* Footer Buttons Actions Layout */}
            <div className="bg-slate-50/70 px-6 py-4.5 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button
                type="button"
                disabled={isLoading}
                onClick={onClose}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 bg-white hover:bg-slate-100/80 active:scale-98 transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              >
                {cancelText}
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={onConfirm}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 border border-red-700 hover:bg-red-700 active:scale-98 transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-red-500/10 cursor-pointer disabled:opacity-80"
              >
                {isLoading ? (
                  <>
                    <span className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    <span>{confirmText}</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
