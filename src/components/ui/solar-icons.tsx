import * as React from "react";
import { addCollection, Icon, type IconProps } from "@iconify/react";
import solarIconData from "./solar-icons-data.json";

// Registered once at module load, from a small local subset of the Solar
// icon set (not the full ~6MB collection) so icons render offline with no
// runtime fetch to the Iconify API.
addCollection(solarIconData);

export type SolarIconProps = { size?: number | string; className?: string } & Omit<IconProps, "icon" | "width" | "height">;

function makeIcon(name: string) {
  const Component = ({ size = 20, className, ...props }: SolarIconProps) => (
    <Icon icon={`solar:${name}`} width={size} height={size} className={className} {...props} />
  );
  Component.displayName = `SolarIcon(${name})`;
  return Component;
}

// One export per lucide-react icon it replaces, matching the same
// `size`/`className` call signature used throughout the app.
export const AlertCircle = makeIcon("danger-circle-linear");
export const BarChart3 = makeIcon("chart-2-linear");
export const Bell = makeIcon("bell-linear");
export const CalendarDays = makeIcon("calendar-linear");
export const CheckCircle2 = makeIcon("check-circle-linear");
export const ChevronDown = makeIcon("alt-arrow-down-linear");
export const Clock = makeIcon("clock-circle-linear");
export const Download = makeIcon("download-linear");
export const LogOut = makeIcon("logout-3-linear");
export const Mail = makeIcon("letter-linear");
export const Menu = makeIcon("hamburger-menu-linear");
export const PanelLeftClose = makeIcon("double-alt-arrow-left-linear");
export const PanelLeftOpen = makeIcon("double-alt-arrow-right-linear");
export const Plus = makeIcon("add-circle-linear");
export const RefreshCcw = makeIcon("refresh-linear");
export const Search = makeIcon("magnifer-linear");
export const Send = makeIcon("plain-linear");
export const Settings = makeIcon("settings-linear");
export const Store = makeIcon("shop-linear");
export const UserCircle = makeIcon("user-circle-linear");
export const Ticket = makeIcon("ticket-linear");
export const Users = makeIcon("users-group-rounded-linear");
export const X = makeIcon("close-circle-linear");
export const XCircle = makeIcon("close-circle-linear");

export type LucideIcon = ReturnType<typeof makeIcon>;
