import {
  LayoutDashboard,
  Wallet,
  Coins,
  Receipt,
  TrendingUp,
  PiggyBank,
  Target,
  Landmark,
  ListTree,
  BookOpenText,
  MessageCircle,
  FileBarChart,
  Bell,
  Settings,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
};

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Kontrol Merkezi", icon: LayoutDashboard },
  { to: "/islemler", label: "İşlemler", icon: ListTree },
  { to: "/hesaplar", label: "Hesaplar", icon: Wallet },
  { to: "/varliklar", label: "Varlıklar", icon: Coins },
  { to: "/odemeler", label: "Ödeme Merkezi", icon: Receipt },
  { to: "/nakit-akisi", label: "Nakit Akışı", icon: TrendingUp },
  { to: "/harcama-plani", label: "Harcama Planı", icon: PiggyBank },
  { to: "/hedefler", label: "Birikim Hedefleri", icon: Target },
  { to: "/borclar", label: "Borç Yönetimi", icon: Landmark },
  { to: "/gunluk", label: "Finans Günlüğü", icon: BookOpenText },
  { to: "/asistan", label: "Finans Asistanı", icon: MessageCircle },
  { to: "/raporlar", label: "Raporlar", icon: FileBarChart },
  { to: "/bildirimler", label: "Bildirimler", icon: Bell },
  { to: "/ayarlar", label: "Ayarlar", icon: Settings },
];


