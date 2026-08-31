export type ProjectTemplateKey =
  | "software"
  | "tesis"
  | "freelance"
  | "personal"
  | "lanzamiento"
  | "investigacion";

export type ProjectTemplate = {
  key: ProjectTemplateKey;
  name: string;
  description: string;
  objective: string;
  specificObjectives: string;
  scope: string;
  exclusions: string;
  requirements: Array<{ description: string; category: string; priority: string }>;
  tasks: Array<{ title: string; status: string; priority: string }>;
  techs?: Array<{ name: string; category: string }>;
  notes: Array<{ title: string; content: string }>;
  milestones: Array<{ title: string }>;
  risks: Array<{ title: string; impact: string }>;
  decisions: Array<{ title: string; context: string }>;
};

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    key: "software",
    name: "Proyecto de software",
    description: "Entrega de un producto técnico con requisitos, tareas y stack definidos.",
    objective: "Entregar un incremento de software usable, trazable y desplegable.",
    specificObjectives: "Definir alcance, implementar requisitos prioritarios, probar y documentar el despliegue.",
    scope: "Aplicación, datos, autenticación y documentación de operación.",
    exclusions: "Marketing, hardware y servicios no contratados.",
    requirements: [
      { description: "Los usuarios autenticados pueden crear y editar los registros del dominio.", category: "Funcional", priority: "Alta" },
      { description: "La aplicación registra auditoría de cambios relevantes.", category: "No funcional", priority: "Media" },
      { description: "Las credenciales no se almacenan en texto plano.", category: "Seguridad", priority: "Alta" },
    ],
    tasks: [
      { title: "Definir alcance y criterios de aceptación", status: "Por hacer", priority: "Alta" },
      { title: "Implementar flujo principal", status: "Por hacer", priority: "Alta" },
      { title: "Pruebas y despliegue", status: "Por hacer", priority: "Media" },
    ],
    techs: [
      { name: "TypeScript", category: "Herramientas" },
      { name: "PostgreSQL", category: "Base de Datos" },
    ],
    notes: [{ title: "Decisiones de arquitectura", content: "Registrar trade-offs en la sección de ADR." }],
    milestones: [{ title: "MVP usable" }, { title: "Release" }],
    risks: [{ title: "Alcance no acotado", impact: "Alta" }],
    decisions: [{ title: "Stack inicial", context: "Se parte del stack actual de NoteCode salvo justificación." }],
  },
  {
    key: "tesis",
    name: "Proyecto de tesis",
    description: "Investigación académica con hitos, bibliografía y requisitos de entrega.",
    objective: "Completar una tesis defendible con evidencia y cronograma.",
    specificObjectives: "Problema, marco teórico, metodología, resultados y defensa.",
    scope: "Documento, evidencias, presentaciones y repositorio de anexos.",
    exclusions: "Publicación en revista, salvo que se declare expresamente.",
    requirements: [
      { description: "El documento sigue la plantilla institucional.", category: "No funcional", priority: "Alta" },
      { description: "Cada capítulo tiene fuentes citadas.", category: "Funcional", priority: "Alta" },
    ],
    tasks: [
      { title: "Definir pregunta de investigación", status: "Por hacer", priority: "Alta" },
      { title: "Redactar marco teórico", status: "Por hacer", priority: "Media" },
      { title: "Levantar evidencias", status: "Por hacer", priority: "Alta" },
    ],
    notes: [{ title: "Bibliografía de trabajo", content: "Añadir referencias y enlaces internos a capítulos." }],
    milestones: [{ title: "Borrador de marco teórico" }, { title: "Defensa" }],
    risks: [{ title: "Retraso de revisión de tutor", impact: "Alta" }],
    decisions: [{ title: "Método", context: "Cualitativo, cuantitativo o mixto. Completar en ADR." }],
  },
  {
    key: "freelance",
    name: "Trabajo freelance",
    description: "Encargo con cliente, entregables, cotización y seguimiento de cobro.",
    objective: "Entregar el alcance contratado y cobrar en la fecha acordada.",
    specificObjectives: "Kickoff, hitos de entrega, aprobación del cliente y facturación.",
    scope: "Servicios descritos en la cotización aprobada.",
    exclusions: "Trabajo extra no presupuestado.",
    requirements: [
      { description: "Cada entregable tiene criterio de aceptación del cliente.", category: "Funcional", priority: "Alta" },
    ],
    tasks: [
      { title: "Kickoff y relevamiento", status: "Por hacer", priority: "Alta" },
      { title: "Entrega 1", status: "Por hacer", priority: "Alta" },
      { title: "Cierre y cobro", status: "Por hacer", priority: "Media" },
    ],
    notes: [{ title: "Acuerdos con el cliente", content: "Resumir alcance, plazos y exclusiones." }],
    milestones: [{ title: "Aprobación de propuesta" }, { title: "Entrega final" }],
    risks: [{ title: "Cambios de alcance sin cotizar", impact: "Alta" }],
    decisions: [{ title: "Modelo de cobro", context: "Hitos versus cierre único." }],
  },
  {
    key: "personal",
    name: "Gestión personal",
    description: "Proyecto privado para hábitos, trámites o metas individuales.",
    objective: "Completar una meta personal con seguimiento semanal.",
    specificObjectives: "Definir meta, cadencia y evidencia de avance.",
    scope: "Tareas y notas privadas del propietario.",
    exclusions: "Información laboral de clientes.",
    requirements: [{ description: "El avance se revisa al menos una vez por semana.", category: "Funcional", priority: "Media" }],
    tasks: [
      { title: "Definir meta medible", status: "Por hacer", priority: "Alta" },
      { title: "Primera acción concreta", status: "Por hacer", priority: "Alta" },
    ],
    notes: [{ title: "Por qué importa", content: "Escribe la motivación y la definición de hecho." }],
    milestones: [{ title: "Primera semana cumplida" }],
    risks: [{ title: "Abandono por falta de cadencia", impact: "Media" }],
    decisions: [{ title: "Cadencia", context: "Revisión semanal fija." }],
  },
  {
    key: "lanzamiento",
    name: "Lanzamiento de producto",
    description: "Salida a producción con checklist comercial, técnico y de soporte.",
    objective: "Lanzar una versión usable con canal de soporte y medición inicial.",
    specificObjectives: "Lista de corte, comunicación, monitoreo y plan de rollback.",
    scope: "Producto, sitio, onboarding y soporte de los primeros 14 días.",
    exclusions: "Campaña paga no presupuestada.",
    requirements: [
      { description: "Existe un procedimiento de rollback documentado.", category: "Técnico", priority: "Alta" },
      { description: "El canal de soporte está publicado.", category: "Funcional", priority: "Media" },
    ],
    tasks: [
      { title: "Congelar alcance de lanzamiento", status: "Por hacer", priority: "Alta" },
      { title: "Ensayo de despliegue", status: "Por hacer", priority: "Alta" },
      { title: "Comunicación de lanzamiento", status: "Por hacer", priority: "Media" },
    ],
    notes: [{ title: "Mensaje de lanzamiento", content: "Qué cambia, para quién y cómo pedir ayuda." }],
    milestones: [{ title: "Go / no-go" }, { title: "Lanzamiento" }],
    risks: [{ title: "Regresión en producción", impact: "Alta" }],
    decisions: [{ title: "Criterio go/no-go", context: "Errores bloqueantes, backups y monitoreo." }],
  },
  {
    key: "investigacion",
    name: "Investigación",
    description: "Exploración estructurada de un problema con fuentes, hipótesis y conclusiones.",
    objective: "Responder una pregunta con evidencia y recomendaciones accionables.",
    specificObjectives: "Pregunta, fuentes, hallazgos y decisión propuesta.",
    scope: "Notas, fuentes y un informe de conclusiones.",
    exclusions: "Implementación del cambio, salvo que se declare.",
    requirements: [{ description: "Cada hallazgo cita al menos una fuente o evidencia.", category: "Funcional", priority: "Alta" }],
    tasks: [
      { title: "Formular la pregunta", status: "Por hacer", priority: "Alta" },
      { title: "Reunir fuentes", status: "Por hacer", priority: "Media" },
      { title: "Redactar conclusiones", status: "Por hacer", priority: "Alta" },
    ],
    notes: [{ title: "Bitácora de fuentes", content: "Registra enlaces y citas. No pegues secretos." }],
    milestones: [{ title: "Hallazgos preliminares" }, { title: "Informe final" }],
    risks: [{ title: "Sesgo de confirmación", impact: "Media" }],
    decisions: [{ title: "Criterio de evidencia", context: "Qué cuenta como fuente suficiente." }],
  },
];

export function getProjectTemplate(key: string | null | undefined) {
  return PROJECT_TEMPLATES.find((template) => template.key === key) ?? null;
}
