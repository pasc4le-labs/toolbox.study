"use client";

import { RiInformationLine, RiGithubLine, RiDiscordLine, RiBookOpenLine, RiSparklingLine } from "@remixicon/react";
import { APP_VERSION } from "@/lib/version";

function InfoCard({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border bg-card p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="text-sm font-medium">{children}</div>
      </div>
    </div>
  );
}

const GITHUB_URL = "https://github.com/giuseppepascale/studytoolbox";
const DISCORD_URL = "https://discord.gg/studytoolbox";
const EUPL_URL = "https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12";

export function AboutTab() {
  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <RiInformationLine className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">About</h2>
        </div>
        <div className="space-y-3">
          <InfoCard icon={RiInformationLine} label="App">
            StudyToolbox <span className="text-muted-foreground">v{APP_VERSION}</span>
          </InfoCard>
          <InfoCard icon={RiBookOpenLine} label="License">
            <a href={EUPL_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-primary">
              EUPL v1.2
            </a>
          </InfoCard>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <RiBookOpenLine className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Links</h2>
        </div>
        <div className="space-y-3">
          <InfoCard icon={RiGithubLine} label="GitHub">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-primary">
              {GITHUB_URL.replace("https://", "")}
            </a>
          </InfoCard>
          <InfoCard icon={RiDiscordLine} label="Discord">
            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-primary">
              {DISCORD_URL}
            </a>
          </InfoCard>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <RiSparklingLine className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Resources</h2>
        </div>
        <div className="space-y-3">
          <InfoCard icon={RiBookOpenLine} label="Import Schema">
            <a href="/factory/import" className="underline underline-offset-2 hover:text-primary">
              JSON Import Format
            </a>
          </InfoCard>
          {process.env.NEXT_PUBLIC_GEMINI_UQF_GEM && (
            <InfoCard icon={RiSparklingLine} label="Gemini UQF Gem">
              <a
                href={process.env.NEXT_PUBLIC_GEMINI_UQF_GEM}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-primary"
              >
                Open UQF Gem
              </a>
            </InfoCard>
          )}
          {process.env.NEXT_PUBLIC_GEMINI_JSON_GEM && (
            <InfoCard icon={RiSparklingLine} label="Gemini JSON Gem">
              <a
                href={process.env.NEXT_PUBLIC_GEMINI_JSON_GEM}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-primary"
              >
                Open JSON Gem
              </a>
            </InfoCard>
          )}
        </div>
      </div>
    </div>
  );
}
