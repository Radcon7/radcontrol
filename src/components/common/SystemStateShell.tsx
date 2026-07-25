import type { ReactNode } from "react";

type Props = {
  title: string;
  actions?: ReactNode;
  meta?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
};

export function SystemStateShell({
  title,
  actions,
  meta,
  error,
  children,
}: Props) {
  return (
    <section className="systemShell">
      <div className="systemShellHeader">
        <div className="systemShellTitle">{title}</div>

        {actions ? <div className="systemShellActions">{actions}</div> : null}
      </div>

      {meta ? <div className="systemShellMeta">{meta}</div> : null}

      {error ? <div className="systemShellError">{error}</div> : null}

      <div className="systemShellBody">{children}</div>
    </section>
  );
}
