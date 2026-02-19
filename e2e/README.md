# End-to-End Tests

Este diretório contém os testes end-to-end (E2E) para o projeto ACTiM usando Playwright.

## Estrutura dos Testes

- **login.spec.ts** - Testes para a página de login
- **navigation.spec.ts** - Testes para navegação e rotas protegidas
- **ui-components.spec.ts** - Testes para componentes da interface
- **accessibility.spec.ts** - Testes de acessibilidade
- **performance.spec.ts** - Testes de performance
- **error-handling.spec.ts** - Testes de tratamento de erros e validações
- **form-interactions.spec.ts** - Testes de interações com formulários
- **fixtures.ts** - Configurações e fixtures customizados

## Executando os Testes

### Pré-requisitos

Certifique-se de que as dependências estão instaladas:

```bash
npm install
```

### Comandos Disponíveis

```bash
# Executar todos os testes E2E
npm run test:e2e

# Executar testes em modo UI (interface gráfica)
npm run test:e2e:ui

# Executar testes com navegador visível
npm run test:e2e:headed

# Executar testes em modo debug
npm run test:e2e:debug
```

### Executar testes específicos

```bash
# Executar apenas testes de login
npx playwright test login

# Executar um teste específico
npx playwright test login.spec.ts -g "should display login form"
```

## Configuração

A configuração do Playwright está em `playwright.config.ts` na raiz do projeto.

### Servidor de Desenvolvimento

Os testes E2E iniciam automaticamente o servidor de desenvolvimento (`npm run dev`) antes de executar os testes. O servidor é encerrado após a conclusão dos testes.

### URL Base

A URL base configurada é `http://127.0.0.1:8080`.

## Escrevendo Novos Testes

Para criar novos testes E2E:

1. Crie um novo arquivo `.spec.ts` neste diretório
2. Importe as fixtures: `import { test, expect } from './fixtures';`
3. Organize os testes em blocos `describe`
4. Use `beforeEach` para configuração comum

Exemplo:

```typescript
import { test, expect } from './fixtures';

test.describe('Minha Funcionalidade', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/minha-rota');
  });

  test('should do something', async ({ page }) => {
    await expect(page.getByText('Algum texto')).toBeVisible();
  });
});
```

## Boas Práticas

1. **Use seletores semânticos**: Prefira `getByRole`, `getByLabel`, `getByText` ao invés de seletores CSS
2. **Espere por elementos**: Use `expect(...).toBeVisible()` ao invés de timeouts fixos
3. **Organize testes logicamente**: Agrupe testes relacionados em blocos `describe`
4. **Mantenha testes independentes**: Cada teste deve funcionar isoladamente
5. **Use fixtures**: Crie fixtures reutilizáveis em `fixtures.ts`

## Relatórios

Após executar os testes, um relatório HTML é gerado automaticamente:

```bash
npx playwright show-report
```

## Debugging

Para debugar um teste com falha:

1. Use `npm run test:e2e:debug` para modo debug interativo
2. Use `npm run test:e2e:headed` para ver o navegador
3. Use `npm run test:e2e:ui` para a interface gráfica do Playwright

## CI/CD

Os testes E2E podem ser executados em pipelines de CI/CD. Certifique-se de:

1. Instalar as dependências do Playwright: `npx playwright install --with-deps`
2. Configurar a variável de ambiente `CI=true`
3. Os testes serão executados sem interface gráfica (headless)

## Recursos

- [Documentação do Playwright](https://playwright.dev/docs/intro)
- [API do Playwright](https://playwright.dev/docs/api/class-playwright)
- [Melhores Práticas](https://playwright.dev/docs/best-practices)
