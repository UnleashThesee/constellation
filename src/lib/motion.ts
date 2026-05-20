import type { Variants, Transition } from 'framer-motion';

// Spring "papier" : ressort doux, cohérent avec l'esthétique Citizen.
export const springSoft: Transition = { type: 'spring', stiffness: 320, damping: 26 };

// Apparition de modal : scale + fade
export const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0, transition: springSoft },
  exit: { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.12 } },
};

// Conteneur de liste avec stagger des enfants
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};

// Élément de liste : monte + fade
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: springSoft },
};
