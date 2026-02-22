import { AnimatePresence, motion } from "framer-motion";
import { FiAlertCircle } from "react-icons/fi";

type SpringModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  tone?: "default" | "danger";
};

export function SpringModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  loading = false,
  tone = "default",
}: SpringModalProps) {
  const danger = tone === "danger";

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (loading) return;
            onClose();
          }}
          className="fixed inset-0 z-[120] grid cursor-pointer place-items-center overflow-y-auto bg-black/55 p-6 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.92, rotate: "8deg", opacity: 0 }}
            animate={{ scale: 1, rotate: "0deg", opacity: 1 }}
            exit={{ scale: 0.92, rotate: "0deg", opacity: 0 }}
            transition={{ type: "spring", bounce: 0.25, duration: 0.4 }}
            onClick={(event) => event.stopPropagation()}
            className={`relative w-full max-w-lg cursor-default overflow-hidden rounded-2xl border p-6 text-white shadow-2xl ${
              danger
                ? "border-rose-300/30 bg-gradient-to-br from-zinc-900 via-rose-950/60 to-zinc-900"
                : "border-cyan-300/30 bg-gradient-to-br from-zinc-900 via-slate-900 to-zinc-900"
            }`}
          >
            <FiAlertCircle className="absolute -left-10 -top-10 z-0 rotate-12 text-[180px] text-white/10" />

            <div className="relative z-10">
              <div
                className={`mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full text-2xl ${
                  danger ? "bg-rose-100 text-rose-600" : "bg-cyan-100 text-cyan-700"
                }`}
              >
                <FiAlertCircle />
              </div>

              <h3 className="text-center text-2xl font-extrabold">{title}</h3>
              <p className="mx-auto mt-2 max-w-md text-center text-sm text-slate-200/90">{description}</p>

              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="w-full rounded-lg border border-white/20 bg-transparent py-2 font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-60"
                >
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  onClick={() => void onConfirm()}
                  disabled={loading}
                  className={`w-full rounded-lg py-2 font-semibold transition-opacity disabled:opacity-60 ${
                    danger
                      ? "bg-rose-100 text-rose-700 hover:opacity-90"
                      : "bg-cyan-100 text-cyan-700 hover:opacity-90"
                  }`}
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
