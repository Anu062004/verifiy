import { Camera, Shield, Database, Clock, CheckCircle2, Activity } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  const stats = [
    { label: "Total Records", value: "0", icon: Database, change: "+0 this week" },
    { label: "Verified", value: "0", icon: CheckCircle2, change: "Pending verification" },
    { label: "Face Matches", value: "0", icon: Camera, change: "No matches yet" },
    { label: "Chain Confirmed", value: "0", icon: Shield, change: "Awaiting confirmations" },
  ];

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-lg text-muted">Face Chain Verifier — Blockchain-verified face verification pipeline</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Pipeline Status
            </CardTitle>
            <CardDescription>Current pipeline execution status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">Storage Service</span>
                </div>
                <Badge variant="secondary">Online</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">0G Galileo Chain</span>
                </div>
                <Badge variant="secondary">Connected</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-yellow-500" />
                  <span className="text-sm font-medium">Google Vision API</span>
                </div>
                <Badge variant="outline">Standby</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-gray-400" />
                  <span className="text-sm font-medium">Face Model</span>
                </div>
                <Badge variant="outline">Idle</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest verification events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Record #{i}</span>
                    <span className="text-xs text-muted">Awaiting confirmation</span>
                  </div>
                  <Badge variant="outline">Pending</Badge>
                </div>
              ))}
              <div className="flex items-center justify-center rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted">
                No recent activity. Submit a verification to get started.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        <Link href="/verify">
          <Button>New Verification</Button>
        </Link>
        <Link href="/records">
          <Button variant="outline">View Records</Button>
        </Link>
      </div>
    </div>
  );
}
