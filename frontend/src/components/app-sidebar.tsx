"use client";

import * as React from "react";
import {
  BookOpen,
  Brush,
  Layers,
  LayoutDashboard,
  Plus,
  Settings2,
  SquareTerminal,
} from "lucide-react";

import { NavMain } from "@/components/nav-main";
import { NavProjects } from "@/components/nav-projects";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

// This is sample data.
const data = {
  user: {
    name: "Your Name",
    email: "user@example.com",
    avatar: "/avatars/user.jpg",
  },

  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
      isActive: false,
      items: [],
    },
    {
      title: "Projects",
      url: "/projects",
      icon: Layers,
      items: [
        {
          title: "New Project",
          url: "/projects/new",
        },
        {
          title: "My Projects",
          url: "/projects",
        },
      ],
    },
    {
      title: "Editor",
      url: "/project/[projectId]/editor",
      icon: Brush,
      items: [],
    },
    {
      title: "Generate",
      url: "/generate",
      icon: SquareTerminal,
      items: [],
    },
    {
      title: "Docs",
      url: "/docs",
      icon: BookOpen,
      items: [
        {
          title: "Get Started",
          url: "/docs/get-started",
        },
        {
          title: "API Reference",
          url: "/docs/api",
        },
      ],
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings2,
      items: [
        {
          title: "Account",
          url: "/settings/account",
        },
        {
          title: "Billing",
          url: "/settings/billing",
        },
      ],
    },
  ],

  projects: [
    {
      name: "Create New Project",
      url: "/projects/new",
      icon: Plus,
    },
    {
      name: "All Projects",
      url: "/projects",
      icon: Layers,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>{/* <TeamSwitcher teams={data.teams} /> */}</SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
