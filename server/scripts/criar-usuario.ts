/**
 * Cria ou atualiza um usuario pela linha de comando.
 *
 * Usado para criar o primeiro administrador e para desbloquear acesso sem
 * depender de e-mail (fora do escopo da Fase 1). A senha e lida de variavel de
 * ambiente ou da entrada padrao — nunca de argumento, porque argumento de
 * processo aparece em `ps` e no historico do shell.
 *
 * Uso:
 *   SENHA='...' npx tsx scripts/criar-usuario.ts \
 *     --usuario cristiane --nome 'Cristiane Rabelo' --perfil gestora --area juridico
 */
import { createInterface } from 'node:readline/promises';
import { db, fecharBanco } from '../src/db/pool.js';
import { gerarHashSenha, validarForcaSenha } from '../src/auth/senha.js';
import type { AreaOrganizacional, PerfilUsuario } from '../src/db/schema.js';

const PERFIS: PerfilUsuario[] = [
  'diretoria',
  'gestora',
  'lider',
  'colaborador',
  'administrador',
  'convidado',
];
const AREAS: AreaOrganizacional[] = [
  'juridico',
  'ti',
  'financeiro',
  'comercial',
  'obras',
  'diretoria',
];

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function lerSenha(): Promise<string> {
  const daVariavel = process.env.SENHA;
  if (daVariavel) return daVariavel;

  const leitor = createInterface({ input: process.stdin, output: process.stdout });
  const senha = await leitor.question('Senha: ');
  leitor.close();
  return senha;
}

async function principal(): Promise<void> {
  const usuario = argumento('usuario')?.trim().toLowerCase();
  const nome = argumento('nome')?.trim();
  const perfil = argumento('perfil')?.trim() as PerfilUsuario | undefined;
  const area = argumento('area')?.trim() as AreaOrganizacional | undefined;
  const email = argumento('email')?.trim() || null;
  const todosEmpreendimentos = process.argv.includes('--todos-empreendimentos');
  const documentoCompleto = process.argv.includes('--documento-completo');

  if (!usuario || !nome || !perfil) {
    console.error(
      'Uso: --usuario <login> --nome <nome> --perfil <perfil> [--area <area>] [--email <email>]\n' +
        '     [--todos-empreendimentos] [--documento-completo]\n' +
        `Perfis: ${PERFIS.join(', ')}\n` +
        `Areas:  ${AREAS.join(', ')}`,
    );
    process.exit(1);
  }

  if (!PERFIS.includes(perfil)) {
    console.error(`Perfil invalido: ${perfil}. Use um de: ${PERFIS.join(', ')}`);
    process.exit(1);
  }
  if (area && !AREAS.includes(area)) {
    console.error(`Area invalida: ${area}. Use uma de: ${AREAS.join(', ')}`);
    process.exit(1);
  }
  if (!/^[a-z0-9_.-]{3,64}$/.test(usuario)) {
    console.error('Usuario deve ter 3 a 64 caracteres, apenas minusculas, numeros, ponto, _ ou -');
    process.exit(1);
  }

  const senha = await lerSenha();
  const forca = validarForcaSenha(senha);
  if (!forca.ok) {
    console.error(forca.motivo);
    process.exit(1);
  }

  const { hash, algoritmo } = await gerarHashSenha(senha);

  const gravado = await db
    .insertInto('usuarios')
    .values({
      usuario,
      nome,
      email,
      perfil,
      area: area ?? null,
      status: 'ativo',
      hash_senha: hash,
      algoritmo_senha: algoritmo,
      senha_alterada_em: new Date(),
    })
    .onConflict((oc) =>
      oc.column('usuario').doUpdateSet({
        nome,
        email,
        perfil,
        area: area ?? null,
        status: 'ativo',
        hash_senha: hash,
        algoritmo_senha: algoritmo,
        senha_alterada_em: new Date(),
        atualizado_em: new Date(),
      }),
    )
    .returning(['id', 'usuario', 'perfil'])
    .executeTakeFirstOrThrow();

  if (todosEmpreendimentos) {
    await db
      .insertInto('escopos_empreendimento')
      .values({ usuario_id: gravado.id, empreendimento_id: null, todos: true })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }

  if (documentoCompleto) {
    for (const tipo of ['dado_pessoal', 'documento'] as const) {
      await db
        .insertInto('escopos_tipo_informacao')
        .values({ usuario_id: gravado.id, tipo, completo: true })
        .onConflict((oc) => oc.columns(['usuario_id', 'tipo']).doUpdateSet({ completo: true }))
        .execute();
    }
  }

  console.log(
    `✓ ${gravado.usuario} (${gravado.perfil})` +
      (todosEmpreendimentos ? ' · todos os empreendimentos' : '') +
      (documentoCompleto ? ' · ve CPF/CNPJ completo' : ''),
  );

  await fecharBanco();
}

principal().catch(async (erro) => {
  console.error('Falha:', erro instanceof Error ? erro.message : erro);
  await fecharBanco().catch(() => {});
  process.exit(1);
});
