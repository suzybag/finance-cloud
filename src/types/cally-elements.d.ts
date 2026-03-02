import type React from "react";

type CalendarDateElementProps =
  React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
    value?: string;
  };

type CalendarMonthElementProps =
  React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "calendar-date": CalendarDateElementProps;
      "calendar-month": CalendarMonthElementProps;
    }
  }
}
