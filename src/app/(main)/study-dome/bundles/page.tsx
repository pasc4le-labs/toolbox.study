"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { RiAddLine, RiDeleteBinLine, RiEditLine } from "@remixicon/react";
import { Boxed } from "@/components/boxed";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDb } from "@/db";
import { getAllBundles, deleteBundle } from "@/lib/services";
import { toast } from "sonner";

export default function BundlesPage() {
  const [bundles, setBundles] = useState<Awaited<ReturnType<typeof getAllBundles>>>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const loadRef = useRef<() => Promise<void>>(undefined);

  useEffect(() => {
    async function load() {
      try {
        const { db } = await getDb();
        const b = await getAllBundles(db);
        setBundles(b);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadRef.current = load;
    load();
  }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { db } = await getDb();
      await deleteBundle(db, deleteId);
      toast.success("Bundle deleted");
      setDeleteId(null);
      await loadRef.current?.();
    } catch {
      toast.error("Failed to delete bundle");
    }
  };

  return (
    <Boxed className="py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Bundles</h1>
        <Button asChild>
          <Link href="/study-dome/bundles/new">
            <RiAddLine className="mr-2 h-4 w-4" />
            New Bundle
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : bundles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-muted-foreground">No bundles yet.</p>
            <Button asChild>
              <Link href="/study-dome/bundles/new">
                <RiAddLine className="mr-2 h-4 w-4" />
                Create Bundle
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {bundles.map((bundle) => (
            <Card key={bundle.id}>
              <Link href={`/study-dome/bundles/${bundle.id}`}>
                <CardHeader>
                  <CardTitle className="text-lg">{bundle.title}</CardTitle>
                  {bundle.description && (
                    <CardDescription>{bundle.description}</CardDescription>
                  )}
                </CardHeader>
              </Link>
              <CardContent className="flex gap-2 pt-0">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/study-dome/bundles/${bundle.id}/edit`}>
                    <RiEditLine className="mr-1 h-4 w-4" />
                    Edit
                  </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDeleteId(bundle.id)}>
                  <RiDeleteBinLine className="mr-1 h-4 w-4" />
                  Delete
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Bundle</DialogTitle>
            <DialogDescription>
              Are you sure? Cards in the bundle will not be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Boxed>
  );
}
