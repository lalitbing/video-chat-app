import { GroupCallIllustration } from "@/app/components/GroupCallIllustration";
import { Avatar } from "@/app/components/ui/Avatar";

const steps = [
  { number: "01", title: "Start a meeting", body: "We hand you a free room." },
  { number: "02", title: "Share it", body: "Send the number or the link." },
  { number: "03", title: "Let them in", body: "The host admits each guest." },
];

// Left pane of the landing page (large screens only).
export const LandingShowcase = () => (
  <div className="relative flex h-full flex-col overflow-hidden rounded-[24px] bg-panel ring-1 ring-white/5">
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)]"
    />
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-[42%] h-[70%] w-[85%] animate-glow rounded-full bg-accent/25 blur-[90px]"
    />

    <div className="relative flex animate-fade-in items-center gap-2 px-7 pt-7 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
      <span className="h-px w-6 bg-accent" />
      How it works
    </div>

    <div className="relative flex min-h-0 flex-1 items-center justify-center px-6">
      <div className="relative w-full max-w-[560px] [@media(max-height:820px)]:max-w-[460px]">
        <GroupCallIllustration className="relative w-full animate-rise" />

        <div
          aria-hidden
          className="absolute -left-2 top-[8%] animate-pop-in [animation-delay:1.5s] xl:-left-6"
        >
          <div className="glass flex animate-float items-center gap-2 rounded-full py-2 pl-2.5 pr-3.5 text-xs font-semibold text-ink ring-1 ring-white/10">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            Room <span className="font-mono">042</span>
            <span className="text-muted">· 4 inside</span>
          </div>
        </div>

        <div
          aria-hidden
          className="absolute -right-3 bottom-[3%] animate-pop-in [animation-delay:2.3s] xl:-right-6"
        >
          <div className="glass flex w-56 animate-float items-center gap-3 rounded-2xl p-2.5 ring-1 ring-white/10 [animation-delay:-2.3s]">
            <Avatar name="Priya" size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-ink">
                Priya
              </div>
              <div className="text-[11px] text-[#8fb8ff]">Asking to join</div>
            </div>
            <span className="rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-bold text-white">
              Admit
            </span>
          </div>
        </div>

        <div
          aria-hidden
          className="absolute -left-3 bottom-0 animate-pop-in [animation-delay:3.1s]"
        >
          <div className="glass flex max-w-[15rem] animate-float items-end gap-2 rounded-2xl p-2.5 ring-1 ring-white/10 [animation-delay:-4.6s]">
            <Avatar name="Theo" size="xs" />
            <div className="rounded-xl rounded-bl-sm bg-accent px-3 py-2 text-xs text-white">
              Can everyone see my screen?
            </div>
          </div>
        </div>
      </div>
    </div>

    <ol className="relative grid grid-cols-3 gap-3 px-6 pb-4">
      {steps.map((step, index) => (
        <li
          key={step.number}
          className="animate-rise rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/5 [@media(max-height:820px)]:p-3"
          style={{ animationDelay: `${300 + index * 120}ms` }}
        >
          <span className="font-mono text-xs font-bold text-accent">
            {step.number}
          </span>
          <div className="mt-2 text-sm font-semibold text-ink">
            {step.title}
          </div>
          <div className="mt-0.5 text-xs leading-relaxed text-muted [@media(max-height:820px)]:hidden">
            {step.body}
          </div>
        </li>
      ))}
    </ol>

    <a
      href="https://storyset.com/people"
      target="_blank"
      rel="noreferrer"
      className="relative self-end px-7 pb-4 text-[10px] text-faint transition hover:text-muted"
    >
      Illustration by Storyset
    </a>
  </div>
);
