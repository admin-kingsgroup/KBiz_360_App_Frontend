import { Crown, Shield, Globe, MapPin, Building2, User, type LucideIcon } from 'lucide-react-native';
import type { RoleKey } from '../../types';

// Icon per role — matches source ROLE_DEFS icon assignments exactly.
export const ROLE_ICONS: Record<RoleKey, LucideIcon> = {
  SUPER_ADMIN: Crown,
  DIRECTOR: Shield,
  GENERAL_MANAGER: Globe,
  BRANCH_MANAGER: MapPin,
  HOD: Building2,
  EMPLOYEE: User,
};
