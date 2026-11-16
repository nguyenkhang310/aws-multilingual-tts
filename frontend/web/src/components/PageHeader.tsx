import { useEffect, useState, type ReactNode } from "react";
import { Button, Icon } from "./ui";

export default function PageHeader({ onMenu, children }: {
  onMenu: () => void;
  children: ReactNode;
}) {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const update = () => setHour(new Date().getHours());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  const greeting = hour >= 5 && hour < 12 ? "Chào buổi sáng" : hour >= 12 && hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";

  return <header className="page-header">
    <div className="page-heading">
      <Button className="icon-button mobile-menu" aria-label="Mở menu điều hướng" onClick={onMenu}>
        <Icon name="menu" />
      </Button>
      <img className="header-logo" src="/brand/hcmute.png" alt="HCMUTE" />
      <div className="header-copy">
        <p className="header-greeting"><span>{greeting},</span> <strong>Nhóm 5</strong></p>
        <p className="header-subtitle">Hệ thống giọng nói đa ngôn ngữ</p>
      </div>
    </div>
    <div className="header-actions">
      {children}
      <span className="header-avatar" role="img" aria-label="Điện toán đám mây"><Icon name="cloud" size={24} /></span>
    </div>
  </header>;
}
