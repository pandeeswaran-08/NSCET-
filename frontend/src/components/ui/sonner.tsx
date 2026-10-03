import React, { useEffect, useState } from "react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const [canRender, setCanRender] = useState(false);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      setCanRender(true);
    }
  }, []);

  if (!canRender) {
    return null;
  }

  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-surface group-[.toaster]:text-text group-[.toaster]:border-v-border group-[.toaster]:shadow-xl group-[.toaster]:rounded-[12px] group-[.toaster]:p-3.5 group-[.toaster]:text-xs group-[.toaster]:font-sans",
          description: "group-[.toast]:text-text-muted",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-white group-[.toast]:font-semibold group-[.toast]:rounded-[8px]",
          cancelButton:
            "group-[.toast]:bg-bg-page group-[.toast]:text-text-muted group-[.toast]:border-v-border group-[.toast]:rounded-[8px]",
          success: "group-[.toast]:border-primary/40",
          error: "group-[.toast]:border-danger/40",
          warning: "group-[.toast]:border-warning/40",
          info: "group-[.toast]:border-primary/40",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
