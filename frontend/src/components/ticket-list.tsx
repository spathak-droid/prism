"use client";

import { Circle, Loader2, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Ticket {
  id: string;
  title: string;
  status: "pending" | "building" | "reviewing" | "complete" | "failed";
}

interface TicketListProps {
  tickets: Ticket[];
}

function TicketStatusIcon({ status }: { status: Ticket["status"] }) {
  switch (status) {
    case "pending":
      return <Circle className="h-4 w-4 text-muted-foreground" />;
    case "building":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case "reviewing":
      return <Loader2 className="h-4 w-4 text-orange-500 animate-spin" />;
    case "complete":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
  }
}

const statusLabel: Record<Ticket["status"], string> = {
  pending: "Pending",
  building: "Building",
  reviewing: "Reviewing",
  complete: "Complete",
  failed: "Failed",
};

export default function TicketList({ tickets }: TicketListProps) {
  if (tickets.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        No tickets yet.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {tickets.map((ticket) => (
        <div
          key={ticket.id}
          className={cn(
            "flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
          )}
        >
          <TicketStatusIcon status={ticket.status} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{ticket.title}</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {statusLabel[ticket.status]}
          </span>
        </div>
      ))}
    </div>
  );
}
