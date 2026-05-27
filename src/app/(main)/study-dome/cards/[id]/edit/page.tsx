"use client";

import { use } from "react";
import { Boxed } from "@/components/boxed";
import { CardForm } from "@/components/card-form";

export default function EditCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Boxed className="py-8">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Edit Card</h1>
      <CardForm cardId={parseInt(id)} />
    </Boxed>
  );
}
