"use client";

import { PageTitle } from "@/components/page-title";
import { Boxed } from "@/components/boxed";
import { CardForm } from "@/components/card-form";

export default function NewCardPage() {

  return (
    <Boxed className="py-8">
      <PageTitle>New Card</PageTitle>
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Create Card</h1>
      <CardForm />
    </Boxed>
  );
}
