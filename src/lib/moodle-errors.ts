function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMessage(raw: unknown): string {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed) as { message?: unknown; error?: unknown };
        return extractMessage(parsed.message ?? parsed.error);
      } catch {
        return stripHtml(trimmed);
      }
    }

    return stripHtml(trimmed);
  }

  if (raw instanceof Error) {
    return stripHtml(raw.message);
  }

  if (raw && typeof raw === 'object') {
    const record = raw as { message?: unknown; error?: unknown };
    return extractMessage(record.message ?? record.error);
  }

  return '';
}

export function normalizeMoodleUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function resolveMoodleConnectionErrorMessage(rawError?: unknown): string | null {
  const message = extractMessage(rawError).toLowerCase();
  if (!message) return null;

  if (
    message.includes('name resolution failed') ||
    message.includes('dns error') ||
    message.includes('failed to lookup address information') ||
    message.includes('name or service not known') ||
    message.includes('enotfound')
  ) {
    return 'Nao foi possivel localizar o endereco do Moodle. Verifique a URL informada e se esse host pode ser resolvido pelo servidor do Supabase.';
  }

  if (message.includes('timeout') || message.includes('timed out')) {
    return 'O Moodle demorou demais para responder. Verifique a URL e a disponibilidade do servidor.';
  }

  if (
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    message.includes('connection refused') ||
    message.includes('connect error') ||
    message.includes('error sending request')
  ) {
    return 'Nao foi possivel conectar ao Moodle. Verifique a URL informada e se o servidor esta acessivel.';
  }

  return null;
}

export function resolveFunctionsInvokeErrorMessage(rawError?: unknown): string {
  return (
    resolveMoodleConnectionErrorMessage(rawError) ||
    extractMessage(rawError) ||
    'Nao foi possivel conectar ao Moodle. Verifique a URL informada.'
  );
}

export function resolveMoodleErrorMessage(rawError?: unknown, rawErrorCode?: unknown): string {
  const error = extractMessage(rawError);
  const errorCode = typeof rawErrorCode === 'string' ? rawErrorCode : '';

  switch (errorCode) {
    case 'invalidlogin':
      return 'Usuario ou senha invalidos.';
    case 'dbconnectionfailed':
      return 'Moodle indisponivel: falha de conexao com o banco de dados do servidor Moodle.';
    case 'service_unavailable':
      return 'Servico web indisponivel neste Moodle. Verifique a configuracao do web service.';
    case 'network_error':
      return (
        resolveMoodleConnectionErrorMessage(error) ||
        'Nao foi possivel conectar ao Moodle. Verifique a URL informada e se o servidor esta acessivel.'
      );
    case 'parse_error':
      return 'O Moodle retornou uma resposta invalida. Verifique se a URL informada aponta para a raiz do Moodle.';
    default:
      return error || (errorCode ? `Erro de autenticacao (${errorCode}).` : 'Nao foi possivel autenticar no Moodle.');
  }
}
