'use client';

import { useEffect, useState, useCallback } from 'react';
import { getDb, persistNow, nukeDb } from '@/db';
import { todos, type Todo, type NewTodo } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { eq, like, asc, desc, count } from 'drizzle-orm';

export default function Home() {
  const [items, setItems] = useState<Todo[]>([]);
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const [dbReady, setDbReady] = useState(false);

  const refresh = useCallback(async () => {
    const { db } = await getDb();
    const all = db.select().from(todos).orderBy(desc(todos.createdAt)).all();
    setItems(all as Todo[]);
  }, []);

  useEffect(() => {
    getDb().then(() => {
      setDbReady(true);
      refresh();
    });
  }, [refresh]);

  const addTodo = async () => {
    if (!title.trim()) return;
    const { db } = await getDb();
    db.insert(todos).values({ title: title.trim() } as NewTodo).run();
    await persistNow();
    setTitle('');
    refresh();
  };

  const toggleTodo = async (todo: Todo) => {
    const { db } = await getDb();
    db.update(todos)
      .set({ done: !todo.done })
      .where(eq(todos.id, todo.id))
      .run();
    await persistNow();
    refresh();
  };

  const deleteTodo = async (id: number) => {
    const { db } = await getDb();
    db.delete(todos).where(eq(todos.id, id)).run();
    await persistNow();
    refresh();
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black font-sans">
      <main className="mx-auto max-w-2xl px-4 py-16">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Drizzle + sql.js + IndexedDB
          </h1>
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              await nukeDb();
              window.location.reload();
            }}
          >
            Nuke DB
          </Button>
        </div>

        {!dbReady && (
          <p className="text-zinc-500 mb-4">Loading database...</p>
        )}

        {/* Add todo */}
        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTodo()}
            placeholder="What needs to be done?"
            className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addTodo}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            Add
          </button>
        </div>

        {/* Query demos */}
        <details className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          <summary className="cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300">
            Query demos (click to expand)
          </summary>
          <div className="mt-2 space-y-2 pl-4 border-l-2 border-zinc-200 dark:border-zinc-700">
            <DemoQuery label="Total count" />
            <DemoQuery label="LIKE search" />
            <DemoQuery label="LIMIT 3" />
          </div>
        </details>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search todos... (uses LIKE)"
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2 mb-4 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Todo list */}
        <ul className="space-y-2">
          {items
            .filter((t) =>
              search
                ? t.title.toLowerCase().includes(search.toLowerCase())
                : true,
            )
            .map((todo) => (
              <li
                key={todo.id}
                className="flex items-center gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3"
              >
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => toggleTodo(todo)}
                  className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                />
                <span
                  className={`flex-1 text-zinc-900 dark:text-zinc-50 ${
                    todo.done
                      ? 'line-through text-zinc-400 dark:text-zinc-600'
                      : ''
                  }`}
                >
                  {todo.title}
                </span>
                <span className="text-xs text-zinc-400">
                  {new Date(todo.createdAt).toLocaleDateString()}
                </span>
                <button
                  onClick={() => deleteTodo(todo.id)}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  Delete
                </button>
              </li>
            ))}
        </ul>

        {dbReady && items.length === 0 && (
          <p className="text-center text-zinc-400 mt-8">
            No todos yet. Add one above!
          </p>
        )}
      </main>
    </div>
  );
}

// ── Demo query components ──

function DemoQuery({ label }: { label: string }) {
  return (
    <button
      onClick={async () => {
        const { db } = await getDb();
        switch (label) {
          case 'Total count': {
            const result = db.select({ count: count() }).from(todos).all();
            alert(`Total todos: ${result[0].count}`);
            break;
          }
          case 'LIKE search': {
            const term = prompt('Search term:') || '';
            const result = db
              .select()
              .from(todos)
              .where(like(todos.title, `%${term}%`))
              .all();
            alert(
              `Found ${result.length} todos:\n${result
                .map((t) => (t as Todo).title)
                .join('\n')}`,
            );
            break;
          }
          case 'LIMIT 3': {
            const result = db.select().from(todos).limit(3).all();
            alert(
              `First 3 todos:\n${result
                .map((t) => (t as Todo).title)
                .join('\n')}`,
            );
            break;
          }
        }
      }}
      className="text-blue-600 dark:text-blue-400 hover:underline"
    >
      {label}
    </button>
  );
}
