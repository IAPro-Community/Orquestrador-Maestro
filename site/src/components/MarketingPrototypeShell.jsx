import React,{useState} from 'react';
import Link from '@docusaurus/Link';

export function PrototypeBrand({compact=false}){
 return <Link to="/prototipo/" className="mp-brand" aria-label="Maestro — início do protótipo">
  <span className="mp-brand-asset"><img src="/Orquestrador-Maestro/img/orquestrador-maestro-logo.png" alt=""/></span>
  <span className="mp-brand-copy"><b>MAESTRO</b>{!compact&&<small>ORQUESTRADOR DE AGENTES</small>}</span>
 </Link>;
}

export function PrototypeHeader(){
 const [open,setOpen]=useState(false);
 return <header className="mp-header">
  <div className="mp-header-inner">
   <PrototypeBrand/>
   <nav className="mp-desktop-nav" aria-label="Navegação do protótipo">
    <Link to="/prototipo/#produto">O produto</Link>
    <Link to="/prototipo/skills/">Explorar skills</Link>
    <Link to="/prototipo/#evidencias">Evidências</Link>
    <Link to="/prototipo/#instalar">Instalar</Link>
   </nav>
   <div className="mp-header-end">
    <span className="mp-prototype-label">PRÉVIA DE DESIGN</span>
    <button type="button" className="mp-menu-toggle" aria-label={open?'Fechar menu':'Abrir menu'} aria-expanded={open} aria-controls="mp-mobile-menu" onClick={()=>setOpen(x=>!x)}>
     <span></span><span></span><span></span>
    </button>
   </div>
  </div>
  {open&&<nav className="mp-mobile-nav" id="mp-mobile-menu" aria-label="Navegação mobile">
   <Link onClick={()=>setOpen(false)} to="/prototipo/#produto">O produto</Link>
   <Link onClick={()=>setOpen(false)} to="/prototipo/skills/">Explorar skills</Link>
   <Link onClick={()=>setOpen(false)} to="/prototipo/#evidencias">Evidências</Link>
   <Link onClick={()=>setOpen(false)} to="/prototipo/#instalar">Instalar</Link>
  </nav>}
 </header>;
}

export function PrototypeFooter(){
 return <footer className="mp-footer">
  <div className="mp-container mp-footer-inner">
   <PrototypeBrand compact/>
   <p>Contexto, roteamento e evidências. Um processo compartilhado entre agentes de IA.</p>
   <a href="https://github.com/IAPro-Community/Orquestrador-Maestro" target="_blank" rel="noreferrer">Código-fonte ↗</a>
  </div>
 </footer>;
}
