import { AuthButton } from "./auth-buttons";

export function Navigation({ active, admin = false }: { active: "/" | "/volgen" | "/settings" | "/beheer/gebruikers"; admin?: boolean }) {
  return <>
    <header><a className="brand" href="/">When2Watch<span className="brand-dot">.</span></a><AuthButton logout /></header>
    <nav className="main-navigation" aria-label="Hoofdnavigatie">
      {[["/", "Agenda"], ["/volgen", "Volgen"], ["/settings", "Instellingen"], ...(admin ? [["/beheer/gebruikers", "Beheer"]] : [])].map(([href, label]) =>
        <a key={href} href={href} aria-current={active === href ? "page" : undefined}>{label}</a>)}
    </nav>
  </>;
}
