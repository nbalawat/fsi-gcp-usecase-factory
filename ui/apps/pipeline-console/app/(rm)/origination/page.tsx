import { AppShell } from "@fsi-bank/components";
import { cookies } from "next/headers";
import { PersonaTopbar } from "../../../components/persona-topbar";
import { OriginationWizard } from "@uc/components/rm/origination-wizard";
import {
  PERSONA_COOKIE,
  parsePersonaCookie,
  personaNav,
} from "../../../lib/personas";

export const dynamic = "force-dynamic";

export default async function OriginationPage(): Promise<JSX.Element> {
  const persona = parsePersonaCookie(cookies().get(PERSONA_COOKIE)?.value);

  return (
    <AppShell
      brand="Commercial Credit"
      context="dev · us-central1"
      nav={personaNav(persona)}
      active="origination"
      avatar="AS"
    >
      <PersonaTopbar
        current={persona}
        left={
          <span className="font-mono text-mono-sm text-ink-3">
            Relationship Manager · Origination
          </span>
        }
      />

      <header className="border-b border-rule bg-paper px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
              Commercial loan origination
            </p>
            <h1 className="mt-1 font-serif text-h1 font-semi tracking-tight text-ink-1">
              Start a new application
            </h1>
            <p className="mt-1 max-w-2xl text-body-sm text-ink-3">
              Find the borrower, structure the ask, and run a sub-2-second
              pre-screen against Reg O, 12 CFR 32, and our concentration
              appetite. If it clears, the case enters the underwriter queue
              and you&rsquo;re notified when it returns for your concurrence.
            </p>
          </div>
        </div>
      </header>

      <main className="px-6 py-6">
        <OriginationWizard />
      </main>
    </AppShell>
  );
}
