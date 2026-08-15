import type { ComponentProps } from "@solidjs/web";

export type ButtonProps = ComponentProps<"button">;

export function Button(props: ButtonProps) {
  return <button {...props} class={`hiraya-button${props.class ? ` ${props.class}` : ""}`} type={props.type ?? "button"} />;
}
