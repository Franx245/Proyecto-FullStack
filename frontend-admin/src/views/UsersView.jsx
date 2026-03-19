import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { ConfirmActionDialog, EmptyState, PaginationControls, StatCard, currency, userRoleLabel } from "./shared";

const USERS_VIEW_STATE_KEY = "duelvault_admin_users_view_state_v1";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readUsersViewState() {
  if (!canUseStorage()) {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem(USERS_VIEW_STATE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export default function UsersView({ users, canEditRoles, updatingUserId, onRoleChange }) {
  const [search, setSearch] = useState(() => readUsersViewState().search || "");
  const [roleFilter, setRoleFilter] = useState(() => readUsersViewState().roleFilter || "all");
  const [page, setPage] = useState(() => {
    const storedPage = Number(readUsersViewState().page);
    return Number.isFinite(storedPage) && storedPage > 0 ? storedPage : 1;
  });
  const [confirmState, setConfirmState] = useState(null);
  const deferredSearch = useDeferredValue(search);
  const pageSize = 8;

  useEffect(() => {
    if (!canUseStorage()) {
      return;
    }

    window.localStorage.setItem(
      USERS_VIEW_STATE_KEY,
      JSON.stringify({
        search,
        roleFilter,
        page,
      })
    );
  }, [page, roleFilter, search]);

  const filteredUsers = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    return users.filter((user) => {
      const roleMatches = roleFilter === "all" || user.role === roleFilter;
      const haystack = [
        user.full_name || "",
        user.username || "",
        user.email || "",
        user.phone || "",
        user.role || "",
      ]
        .join(" ")
        .toLowerCase();

      return roleMatches && (!needle || haystack.includes(needle));
    });
  }, [deferredSearch, roleFilter, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, page]);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const customerCount = users.filter((user) => user.role === "USER").length;
  const staffCount = users.filter((user) => user.role === "STAFF").length;
  const adminCount = users.filter((user) => user.role === "ADMIN").length;
  const isRoleMutationPending = Boolean(updatingUserId);

  if (!users.length) {
    return <EmptyState icon={Users} title="Sin usuarios cargados" description="Los registros y actividades de la tienda pública aparecerán acá." />;
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl border border-white/10 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">CRM</p>
            <h2 className="mt-1 text-xl font-black text-white">Usuarios, actividad y roles</h2>
            <p className="mt-2 text-sm text-slate-400">Concentrá gasto, pedidos y control de acceso desde una sola vista.</p>
          </div>
          {!canEditRoles ? (
            <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">
              STAFF solo puede consultar información de usuarios.
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <StatCard title="Usuarios" value={users.length} />
          <StatCard title="Clientes" value={customerCount} />
          <StatCard title="Equipo" value={staffCount} />
          <StatCard title="Admins" value={adminCount} />
        </div>

        <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, email, usuario o teléfono"
              className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 pl-10 pr-4 text-sm outline-none transition focus:border-amber-400"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="h-11 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition focus:border-amber-400"
          >
            <option value="all">Todos los roles</option>
            <option value="USER">Cliente</option>
            <option value="STAFF">Equipo</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </div>
      </div>

      {filteredUsers.length === 0 ? (
        <EmptyState icon={Users} title="Sin coincidencias" description="Ajustá la búsqueda o el filtro de rol para encontrar usuarios." />
      ) : (
        <div className="space-y-4">
          {paginatedUsers.map((user) => (
            <div key={user.id} className="glass admin-list-card admin-content-auto rounded-3xl border border-white/10 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-black text-white">{user.full_name || user.username}</p>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-bold tracking-[0.2em] text-amber-300">{userRoleLabel(user.role)}</span>
                    {!user.is_active ? <span className="rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold text-rose-200">Inactivo</span> : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{user.email}</p>
                  <p className="text-sm text-slate-500">@{user.username} {user.phone ? `· ${user.phone}` : ""}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:min-w-[420px] lg:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
                    <p className="text-slate-400">Pedidos</p>
                    <p className="mt-1 text-lg font-black text-white">{user.order_count}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
                    <p className="text-slate-400">Direcciones</p>
                    <p className="mt-1 text-lg font-black text-white">{user.address_count}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm sm:col-span-2">
                    <p className="text-slate-400">Total gastado</p>
                    <p className="mt-1 text-lg font-black text-white">{currency(user.total_spent)}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Rol</p>
                  <select
                    value={user.role}
                    disabled={!canEditRoles || isRoleMutationPending}
                    onChange={(event) => {
                      const nextRole = event.target.value;
                      if (nextRole === user.role) {
                        return;
                      }

                      setConfirmState({
                        userId: user.id,
                        userLabel: user.full_name || user.username || user.email || `Usuario ${user.id}`,
                        nextRole,
                      });
                    }}
                    className="mt-3 h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm font-semibold text-white outline-none transition focus:border-amber-400 disabled:opacity-60"
                  >
                    <option value="USER">Cliente</option>
                    <option value="STAFF">Equipo</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                  <p className="mt-3 text-xs text-slate-500">Último login: {user.last_login_at ? new Date(user.last_login_at).toLocaleString("es-AR") : "sin actividad"}</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Direcciones</p>
                  <div className="mt-3 space-y-2">
                    {user.addresses.length === 0 ? (
                      <p className="text-slate-500">Sin direcciones guardadas.</p>
                    ) : user.addresses.slice(0, 3).map((address) => (
                      <div key={address.id} className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-3">
                        <p className="font-semibold text-white">{address.label}</p>
                        <p className="mt-1 text-slate-400">{[address.line1, address.line2, address.city, address.state].filter(Boolean).join(", ")}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Actividad reciente</p>
                  <div className="mt-3 space-y-2">
                    {user.activities.length === 0 ? (
                      <p className="text-slate-500">Sin actividad registrada.</p>
                    ) : user.activities.slice(0, 4).map((activity) => (
                      <div key={activity.id} className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-3">
                        <p className="font-semibold text-white">{String(activity.action || "").replaceAll("_", " ")}</p>
                        <p className="mt-1 text-slate-400">{new Date(activity.created_at).toLocaleString("es-AR")}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="glass overflow-hidden rounded-3xl border border-white/10">
            <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      )}

      <ConfirmActionDialog
        open={Boolean(confirmState)}
        title={`Cambiar rol de ${confirmState?.userLabel || "usuario"}`}
        description={`El usuario pasará a ${userRoleLabel(confirmState?.nextRole)}. Este cambio impacta permisos efectivos del panel y de operación.`}
        confirmLabel="Sí, cambiar rol"
        tone="warning"
        pending={Boolean(confirmState?.userId && updatingUserId === confirmState.userId)}
        onCancel={() => {
          if (!isRoleMutationPending) {
            setConfirmState(null);
          }
        }}
        onConfirm={() => {
          if (confirmState?.userId && confirmState?.nextRole) {
            onRoleChange(confirmState.userId, confirmState.nextRole);
          }
        }}
      />
    </div>
  );
}