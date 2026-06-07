"use client";

import Link from "next/link";
import { RiEditLine, RiDeleteBinLine } from "@remixicon/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BundleCardProps {
  bundle: {
    id: number;
    title: string;
    description: string | null;
    emoji: string | null;
    coverColor: string | null;
  };
  showActions?: boolean;
  onDelete?: (id: number) => void;
  editHref?: string;
  className?: string;
}

export function BundleCard({
  bundle,
  showActions = false,
  onDelete,
  editHref,
  className,
}: BundleCardProps) {
  const href = `/study-dome/bundles/${bundle.id}`;
  const hasCover = Boolean(bundle.coverColor);

  return (
    <Card className={cn("relative overflow-hidden p-0", showActions && 'pb-4', className)}>
      {hasCover && (
        <div
          className="absolute inset-x-0 top-0 h-2"
          style={{ backgroundColor: bundle.coverColor ?? undefined }}
          aria-hidden
        />
      )}
      <Link href={href} className="block">
        <CardHeader className={cn("px-4 pt-6", !showActions && 'pb-4')}>
          <div className="flex items-start gap-2">
            {bundle.emoji && (
              <span className="text-2xl leading-none" aria-hidden>
                {bundle.emoji}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <CardTitle className="text-lg">{bundle.title}</CardTitle>
              {bundle.description && (
                <CardDescription className="line-clamp-2">
                  {bundle.description}
                </CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
      </Link>
      {showActions && (
        <CardContent className="flex flex-wrap gap-2 pt-0">
          {editHref && (
            <Button variant="outline" asChild>
              <Link href={editHref}>
                <RiEditLine className="mr-1 h-4 w-4" />
                Edit
              </Link>
            </Button>
          )}
          {onDelete && (
            <Button variant="outline" onClick={() => onDelete(bundle.id)}>
              <RiDeleteBinLine className="mr-1 h-4 w-4" />
              Delete
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
