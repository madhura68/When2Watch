import { AuthButton } from "./auth-buttons";

export function Navigation({ active, admin = false }: { active: "/" | "/following" | "/settings" | "/admin/users" | "/admin/series"; admin?: boolean }) {
  return <>
    <header><a className="brand" href="/">When2Watch<span className="brand-dot">.</span></a><AuthButton logout /></header>
    <nav className="main-navigation" aria-label="Main navigation">
      {[["/", "Agenda"], ["/following", "Following"], ["/settings", "Settings"], ...(admin ? [["/admin/users", "Users"], ["/admin/series", "Stats"]] : [])].map(([href, label]) =>
        <a key={href} href={href} aria-current={active === href ? "page" : undefined}>{label}</a>)}
    </nav>
  </>;
}
