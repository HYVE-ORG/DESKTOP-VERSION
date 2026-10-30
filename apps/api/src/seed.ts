import { randomUUID } from 'node:crypto';
import type { User, Task, State, Status } from '../../../packages/contracts';
import { emptyState } from './store';
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export function seedState(name: string, email: string, passwordHash: string, examples = true): State {
    const s = emptyState();
    const orgId = id(), workspaceId = id(), projectId = id();
    s.orgs.push({ id: orgId, name: 'Forma Studio', description: 'Um espaço para transformar boas ideias em trabalho bem feito.' });
    s.workspaces.push({ id: workspaceId, orgId, name: 'Produto e Tecnologia', color: '#5798df' });
    s.projects.push({ id: projectId, orgId, workspaceId, name: 'Redesign do website', description: 'Uma nova experiência, do primeiro rascunho à entrega.', color: '#eea0c5', archived: false, version: 1 });
    const user = (name: string, email: string, role: User['role'], handle: string, title: string): User => ({ id: id(), orgId, name, email, role, handle, title, passwordHash, status: 'active', bio: '', location: '', timezone: 'America/Sao_Paulo', projectIds: [projectId], workspaceIds: [workspaceId] });
    const owner = user(name, email, 'admin', 'admin', 'Líder de produto');
    s.users.push(owner);
    if (examples) {
        const ana = user('Ana Costa', 'ana@forma.local', 'coordinator', 'ana', 'Product Designer');
        const lucas = user('Lucas Oliveira', 'lucas@forma.local', 'user', 'lucas', 'Senior Software Engineer');
        const marina = user('Marina Santos', 'marina@forma.local', 'user', 'marina', 'Brand Designer');
        ana.bio = 'Conectando pessoas, ideias e boas experiências.';
        ana.location = 'São Paulo, Brasil';
        lucas.bio = 'Transformando café e boas ideias em produtos que fazem a diferença.';
        lucas.location = 'Curitiba, Brasil';
        s.users.push(ana, lucas, marina);
        const marketing = { id: id(), orgId, name: 'Marketing', color: '#ad92d4' };
        const rh = { id: id(), orgId, name: 'Pessoas e Cultura', color: '#5fa998' };
        s.workspaces.push(marketing, rh);
        const campaign = { id: id(), orgId, workspaceId: marketing.id, name: 'Campanha de lançamento', description: 'Criando conexões para o nosso próximo capítulo.', color: '#aa90d3', archived: false, version: 1 };
        const hiring = { id: id(), orgId, workspaceId: rh.id, name: 'Onboarding da equipe', description: 'Um começo acolhedor para cada pessoa.', color: '#59a18a', archived: false, version: 1 };
        s.projects.push(campaign, hiring);
        owner.workspaceIds.push(marketing.id, rh.id);
        owner.projectIds.push(campaign.id, hiring.id);
        const names = [
            ['Mapear a jornada do usuário', 'Pesquisa', 'todo'], ['Definir a arquitetura de informação', 'Produto', 'todo'], ['Explorar referências visuais', 'Design', 'todo'], ['Revisar os textos da página inicial', 'Conteúdo', 'todo'],
            ['Criar a nova landing page', 'Design', 'in_progress'], ['Desenvolver componentes do dashboard', 'Frontend', 'in_progress'], ['Organizar biblioteca de ícones', 'Design', 'in_progress'],
            ['Validar fluxo de cadastro', 'Produto', 'in_review'], ['Revisar o design system', 'Design', 'in_review'],
            ['Alinhar objetivos do projeto', 'Estratégia', 'done'], ['Definir personas principais', 'Pesquisa', 'done'], ['Inventariar páginas existentes', 'Conteúdo', 'done'], ['Preparar ambiente de desenvolvimento', 'Frontend', 'done'], ['Documentar decisões iniciais', 'Produto', 'done'], ['Criar moodboard do projeto', 'Design', 'done'], ['Revisar acessibilidade da navegação', 'Frontend', 'done'],
        ];
        names.forEach(([title, label, status], i) => {
            const createdAt = new Date(Date.now() - (10 + i) * 86400000).toISOString();
            const assigned = [ana, lucas, marina][i % 3];
            const t: Task = { id: id(), orgId, projectId, title, description: 'Vamos construir uma experiência simples, clara e consistente. Use o briefing do projeto como referência e compartilhe sua evolução com a equipe.', status: status as Status, priority: ['high', 'medium', 'low'][i % 3] as Task['priority'], dueDate: new Date(Date.now() + (i % 5 - 1) * 86400000).toISOString().slice(0, 10), labels: [label], assigneeIds: [assigned.id], checklist: [{ id: id(), text: 'Revisar contexto e referências', done: status !== 'todo' }, { id: id(), text: 'Compartilhar resultado com a equipe', done: status === 'done' }], version: 1, createdAt, updatedAt: createdAt, archived: false, comments: [], events: [{ id: id(), actorId: owner.id, text: 'criou a tarefa', at: createdAt }] };
            if (status === 'done')
                t.firstCompletion = { at: new Date(Date.now() - (i % 8) * 86400000).toISOString(), assigneeIds: [assigned.id] };
            s.tasks.push(t);
        });
        s.tasks.push({ ...structuredClone(s.tasks[0]), id: id(), projectId: hiring.id, title: 'Preparar boas-vindas da equipe', assigneeIds: [owner.id], events: [], comments: [] });
        s.folders.push({ id: id(), orgId, projectId, name: 'Referências e briefing', archived: false }, { id: id(), orgId, projectId, name: 'Entregas de design', archived: false });
        s.documents.push({ id: id(), orgId, projectId, title: 'Briefing do projeto', body: '# Um novo capítulo para o nosso website\n\n## O desafio\nCriar uma experiência clara, acolhedora e coerente com a nossa equipe.\n\n## Objetivos\n- Simplificar a navegação\n- Comunicar nossa proposta de valor\n- Garantir acessibilidade e performance\n\n## Como trabalhamos\nCada entrega deve ter contexto, responsável e um próximo passo claro. Compartilhe decisões no chat e mantenha suas tarefas atualizadas.', version: 1, updatedAt: now(), revisions: [] });
        const start = new Date();
        start.setHours(start.getHours() + 2, 0, 0, 0);
        s.calendar.push({ id: id(), orgId, projectId, title: 'Review de design · Website', start: start.toISOString(), end: new Date(start.getTime() + 1800000).toISOString(), attendeeIds: [owner.id, ana.id, lucas.id], responses: {}, meeting: true, createdBy: ana.id, version: 1 });
    }
    for (const p of s.projects) {
        const c = { id: id(), orgId, projectId: p.id, kind: 'project' as const, name: p.name, memberIds: [], archived: false };
        s.conversations.push(c);
        if (examples && p.id === projectId) {
            const authors = [s.users[1], owner, s.users[2]];
            ['Bom dia, equipe! O briefing já está em Docs. Vamos usar este espaço para compartilhar decisões e acompanhar nossas entregas. ✨', 'Perfeito! Organizei as primeiras tarefas no quadro. Cada pessoa já pode começar pela sua próxima entrega.', 'Ambiente pronto por aqui. Vou trabalhar nos componentes do dashboard e compartilho uma prévia ainda hoje.'].forEach((body, i) => s.messages.push({ id: id(), orgId, conversationId: c.id, authorId: authors[i].id, body, attachmentIds: [], recipients: [], everRecipients: [], createdAt: new Date(Date.now() - (45 - i * 10) * 60000).toISOString(), version: 1 }));
        }
    }
    return s;
}
