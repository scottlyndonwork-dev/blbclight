import { Download, FileSpreadsheet, Plus, Upload, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied, EmptyState, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { CollapsibleFilters, FilterSelect, Pager, SearchInput } from "@/components/shared/url-controls";
import { MobileList, MobileListItem } from "@/components/shared/mobile-list";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import { getUserWithAccess } from "@/server/auth/session";
import { getMemberLookups, listMembers, MEMBER_SORTS, MEMBERS_PAGE_SIZE, parseMemberFilters } from "@/server/queries/members";

export const metadata: Metadata = { title: "Members" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function MembersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <MembersDirectory searchParams={searchParams} />
    </Suspense>
  );
}

async function MembersDirectory({ searchParams }: { searchParams: SearchParams }) {
  const [{ user, allowed }, params] = await Promise.all([getUserWithAccess(["members.read"]), searchParams]);
  if (!allowed) return <AccessDenied />;

  const filters = parseMemberFilters(params);
  const [{ rows, total, error }, lookups] = await Promise.all([listMembers(filters), getMemberLookups()]);
  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);

  const exportQuery = new URLSearchParams();
  for (const key of ["q", "status", "category", "ministry", "baptized", "from", "to", "view"] as const) {
    const v = params[key];
    if (typeof v === "string" && v) exportQuery.set(key, v);
  }

  return (
    <>
      <PageHeader
        title="Members"
        description="Search, view and manage church membership records."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Members" }]}
        actions={
          <>
            {can("members.export") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Download /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <a href={`/api/exports/members?format=xlsx&${exportQuery}`}>
                      <FileSpreadsheet /> Excel (.xlsx)
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={`/api/exports/members?format=csv&${exportQuery}`}>
                      <FileSpreadsheet /> CSV
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {can("members.import") && (
              <Button variant="outline" asChild>
                <Link href="/members/import">
                  <Upload /> Import
                </Link>
              </Button>
            )}
            {can("members.write") && (
              <Button asChild>
                <Link href="/members/new">
                  <Plus /> Register member
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="rounded-lg border bg-card">
        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput placeholder="Search name or member ID" />
          <CollapsibleFilters params={["status", "category", "ministry", "baptized", "sort", "view"]}>
          <FilterSelect
            param="status"
            placeholder="Status"
            allLabel="All statuses"
            options={lookups.statuses.map((s) => ({ value: s.key, label: s.name }))}
          />
          <FilterSelect
            param="category"
            placeholder="Category"
            allLabel="All categories"
            options={lookups.categories.map((c) => ({ value: c.id, label: c.name }))}
          />
          <FilterSelect
            param="ministry"
            placeholder="Ministry"
            allLabel="All ministries"
            options={lookups.ministries.map((m) => ({ value: m.id, label: m.name }))}
          />
          <FilterSelect
            param="baptized"
            placeholder="Baptism"
            allLabel="Baptized or not"
            options={[
              { value: "yes", label: "Baptized" },
              { value: "no", label: "Not baptized" },
            ]}
          />
          <FilterSelect
            param="sort"
            placeholder="Sort"
            allLabel="Sort: Name (A–Z)"
            options={Object.entries(MEMBER_SORTS)
              .filter(([k]) => k !== "name")
              .map(([value, s]) => ({ value, label: `Sort: ${s.label}` }))}
          />
          {can("members.archive") && (
            <FilterSelect param="view" placeholder="Records" allLabel="Current records" options={[{ value: "archived", label: "Archived records" }]} />
          )}
          </CollapsibleFilters>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Users}
              title={filters.q || filters.status || filters.category || filters.ministry || filters.baptized ? "No members match your filters" : "No members registered yet"}
              description={
                filters.q || filters.status ? "Try a different search term or clear the filters." : "Register the first member to start building the directory."
              }
              action={
                can("members.write") && !filters.q ? (
                  <Button asChild>
                    <Link href="/members/new">
                      <Plus /> Register member
                    </Link>
                  </Button>
                ) : undefined
              }
              className="border-0"
            />
          </div>
        ) : (
          <>
            <MobileList>
              {rows.map((m) => (
                <MobileListItem
                  key={m.id}
                  href={`/members/${m.id}`}
                  title={`${m.last_name}, ${m.first_name}`}
                  subtitle={[m.member_no, m.city].filter(Boolean).join(" · ")}
                  badge={<StatusBadge tone={m.status_color}>{m.status_name}</StatusBadge>}
                />
              ))}
            </MobileList>
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Member ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Category</TableHead>
                  <TableHead className="hidden lg:table-cell">Baptized</TableHead>
                  <TableHead className="hidden xl:table-cell">Contact</TableHead>
                  <TableHead className="hidden sm:table-cell">Registered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-xs">{m.member_no}</TableCell>
                    <TableCell>
                      <Link href={`/members/${m.id}`} className="font-medium hover:text-primary hover:underline">
                        {m.last_name}, {m.first_name}
                      </Link>
                      {m.city && <p className="text-xs text-muted-foreground">{m.city}</p>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={m.status_color}>{m.status_name}</StatusBadge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{m.category_name ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">{m.is_baptized ? "Yes" : "No"}</TableCell>
                    <TableCell className="hidden text-muted-foreground xl:table-cell">{m.contact_number ?? m.email ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">{formatDate(m.date_registered)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            <Pager page={filters.page} pageSize={MEMBERS_PAGE_SIZE} total={total} />
          </>
        )}
      </div>
    </>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-72" />
      <div className="space-y-2 rounded-lg border bg-card p-3">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
