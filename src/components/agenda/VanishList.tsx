"use client";

import { AnimatePresence, motion, useAnimate, usePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { FiClock, FiPlus, FiTrash2 } from "react-icons/fi";
import { getStorageItem, setStorageItem } from "@/lib/safeStorage";

type TimeUnit = "mins" | "hrs";

type DailyTodo = {
  id: string;
  text: string;
  checked: boolean;
  time: number;
  unit: TimeUnit;
};

const STORAGE_KEY = "agenda_daily_tasks_v1";

const DEFAULT_TODOS: DailyTodo[] = [
  { id: "task-1", text: "Organizar contas do dia", checked: false, time: 10, unit: "mins" },
  { id: "task-2", text: "Revisar gastos pendentes", checked: false, time: 15, unit: "mins" },
  { id: "task-3", text: "Conferir agenda financeira", checked: true, time: 5, unit: "mins" },
  { id: "task-4", text: "Separar comprovantes", checked: false, time: 1, unit: "hrs" },
];

const buildTaskId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const formatDuration = (time: number, unit: TimeUnit) => `${time} ${unit}`;

export const VanishList = () => {
  const [todos, setTodos] = useState<DailyTodo[]>(DEFAULT_TODOS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = getStorageItem(STORAGE_KEY, "local");
      if (!raw) return;
      const parsed = JSON.parse(raw) as DailyTodo[];
      if (Array.isArray(parsed)) {
        setTodos(parsed);
      }
    } catch {
      setTodos(DEFAULT_TODOS);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setStorageItem(STORAGE_KEY, JSON.stringify(todos), "local");
  }, [hydrated, todos]);

  const handleCheck = (id: string) => {
    setTodos((prev) => prev.map((task) => (task.id === id ? { ...task, checked: !task.checked } : task)));
  };

  const removeElement = (id: string) => {
    setTodos((prev) => prev.filter((task) => task.id !== id));
  };

  const addTask = (payload: { text: string; time: number; unit: TimeUnit }) => {
    setTodos((prev) => [
      {
        id: buildTaskId(),
        text: payload.text,
        checked: false,
        time: payload.time,
        unit: payload.unit,
      },
      ...prev,
    ]);
  };

  return (
    <section className="rounded-3xl border border-violet-300/20 bg-[linear-gradient(160deg,rgba(31,22,54,0.72),rgba(12,9,26,0.82))] p-4 backdrop-blur-xl sm:p-5">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-white">Tarefas diarias</h3>
        <p className="text-sm text-violet-100/70">Checklist rapido para executar junto com sua agenda.</p>
      </div>

      <Todos removeElement={removeElement} todos={todos} handleCheck={handleCheck} />
      <Form onCreate={addTask} />
    </section>
  );
};

const Form = ({ onCreate }: { onCreate: (payload: { text: string; time: number; unit: TimeUnit }) => void }) => {
  const [visible, setVisible] = useState(false);
  const [time, setTime] = useState<number>(15);
  const [text, setText] = useState("");
  const [unit, setUnit] = useState<TimeUnit>("mins");

  const handleSubmit = () => {
    const normalizedText = text.trim();
    if (!normalizedText) return;

    onCreate({
      text: normalizedText,
      time: Number.isFinite(time) && time > 0 ? Math.floor(time) : 1,
      unit,
    });

    setTime(15);
    setText("");
    setUnit("mins");
    setVisible(false);
  };

  return (
    <div className="mt-4">
      <AnimatePresence initial={false}>
        {visible ? (
          <motion.form
            key="agenda-task-form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onSubmit={(event) => {
              event.preventDefault();
              handleSubmit();
            }}
            className="mb-3 rounded-2xl border border-violet-300/20 bg-[#120d21]/80 p-3"
          >
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Qual tarefa voce precisa fazer hoje?"
              className="h-24 w-full resize-none rounded-xl border border-violet-300/15 bg-[#0f0b1d] p-3 text-sm text-slate-100 placeholder:text-slate-500 caret-slate-100 outline-none focus:border-violet-400/60"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  className="w-20 rounded-lg border border-violet-300/20 bg-[#1b1430] px-2 py-1 text-sm text-slate-100 outline-none focus:border-violet-400/60"
                  value={time}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setTime(Number.isFinite(next) ? next : 1);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setUnit("mins")}
                  className={`rounded-lg px-2 py-1 text-xs ${
                    unit === "mins"
                      ? "bg-violet-100 text-violet-950"
                      : "bg-violet-300/15 text-violet-100 transition-colors hover:bg-violet-500/30"
                  }`}
                >
                  mins
                </button>
                <button
                  type="button"
                  onClick={() => setUnit("hrs")}
                  className={`rounded-lg px-2 py-1 text-xs ${
                    unit === "hrs"
                      ? "bg-violet-100 text-violet-950"
                      : "bg-violet-300/15 text-violet-100 transition-colors hover:bg-violet-500/30"
                  }`}
                >
                  hrs
                </button>
              </div>
              <button
                type="submit"
                className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
              >
                Adicionar
              </button>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setVisible((prev) => !prev)}
        className="grid w-full place-content-center rounded-full border border-violet-300/20 bg-violet-950/45 py-3 text-lg text-white transition-colors hover:bg-violet-900/60"
      >
        <FiPlus className={`transition-transform ${visible ? "rotate-45" : "rotate-0"}`} />
      </button>
    </div>
  );
};

const Todos = ({
  todos,
  handleCheck,
  removeElement,
}: {
  todos: DailyTodo[];
  handleCheck: (id: string) => void;
  removeElement: (id: string) => void;
}) => {
  if (!todos.length) {
    return (
      <p className="rounded-xl border border-violet-300/20 bg-black/25 px-4 py-5 text-sm text-slate-300">
        Nenhuma tarefa diaria adicionada.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      <AnimatePresence initial={false}>
        {todos.map((task) => (
          <Todo
            key={task.id}
            id={task.id}
            checked={task.checked}
            time={formatDuration(task.time, task.unit)}
            handleCheck={handleCheck}
            removeElement={removeElement}
          >
            {task.text}
          </Todo>
        ))}
      </AnimatePresence>
    </div>
  );
};

const Todo = ({
  removeElement,
  handleCheck,
  id,
  children,
  checked,
  time,
}: {
  removeElement: (id: string) => void;
  handleCheck: (id: string) => void;
  id: string;
  children: string;
  checked: boolean;
  time: string;
}) => {
  const [isPresent, safeToRemove] = usePresence();
  const [scope, animate] = useAnimate();

  useEffect(() => {
    if (!isPresent) {
      const exitAnimation = async () => {
        await animate(
          "p",
          {
            color: checked ? "#6ee7b7" : "#fca5a5",
          },
          {
            ease: "easeIn",
            duration: 0.125,
          },
        );

        await animate(
          scope.current,
          {
            scale: 1.025,
          },
          {
            ease: "easeIn",
            duration: 0.125,
          },
        );

        await animate(
          scope.current,
          {
            opacity: 0,
            x: checked ? 24 : -24,
          },
          {
            delay: 0.5,
            duration: 0.25,
          },
        );
        safeToRemove();
      };

      void exitAnimation();
    }
  }, [animate, checked, isPresent, safeToRemove, scope]);

  return (
    <motion.div
      ref={scope}
      layout
      className="relative flex items-center gap-3 rounded-xl border border-violet-300/15 bg-black/25 p-3"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => handleCheck(id)}
        className="size-4 accent-violet-400"
      />
      <p className={`text-sm text-white transition-colors ${checked ? "text-slate-400 line-through" : ""}`}>
        {children}
      </p>
      <div className="ml-auto flex gap-1.5">
        <div className="flex items-center gap-1.5 whitespace-nowrap rounded bg-violet-950/55 px-2 py-1 text-xs text-slate-300">
          <FiClock />
          <span>{time}</span>
        </div>
        <button
          type="button"
          onClick={() => removeElement(id)}
          className="rounded bg-rose-300/20 px-2 py-1 text-xs text-rose-200 transition-colors hover:bg-rose-500/40"
          aria-label="Excluir tarefa"
        >
          <FiTrash2 />
        </button>
      </div>
    </motion.div>
  );
};
