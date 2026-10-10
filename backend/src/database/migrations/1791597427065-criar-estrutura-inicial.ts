import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CriarEstruturaInicial1791597427065 implements MigrationInterface {
  name = 'CriarEstruturaInicial1791597427065';

  async up(executor: QueryRunner): Promise<void> {
    // Cria as tabelas antes dos relacionamentos para evitar dependências de ordem.
    await executor.query(`CREATE TABLE \`pedidos\` (\`id\` varchar(36) NOT NULL,
        \`link_checkout_id\` varchar(36) NOT NULL,
        \`referencia_externa\` varchar(100) NOT NULL,
        \`identificador_pagamento_gateway\` varchar(100) NULL,
        \`estado\` enum ('PENDENTE', 'APROVADO', 'NEGADO') NOT NULL DEFAULT 'PENDENTE',
        \`criado_em\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`atualizado_em\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_e47337cb42b1d1fc79708844ba\` (\`referencia_externa\`),
        UNIQUE INDEX \`IDX_4da7256d65ef9c02b1c6ca5fa6\` (\`identificador_pagamento_gateway\`),
        UNIQUE INDEX \`REL_38220385a29e41833b7a36a8f6\` (\`link_checkout_id\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`);

    await executor.query(`CREATE TABLE \`contas_gateway\` (\`id\` varchar(36) NOT NULL,
        \`usuario_id\` varchar(36) NOT NULL,
        \`identificador_gateway\` varchar(36) NOT NULL,
        \`documento\` varchar(14) NOT NULL,
        \`codigo_cliente\` int UNSIGNED NOT NULL,
        \`token_criptografado\` text NULL,
        \`chave_loja_criptografada\` text NULL,
        \`token_expira_em\` datetime(6) NULL,
        \`criado_em\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`atualizado_em\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_eb79508a8b9a31693e02831bd9\` (\`identificador_gateway\`),
        UNIQUE INDEX \`REL_488b6333944722844153cc2ded\` (\`usuario_id\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`);

    await executor.query(`CREATE TABLE \`usuarios\` (\`id\` varchar(36) NOT NULL,
        \`nome\` varchar(150) NOT NULL,
        \`email\` varchar(254) NOT NULL,
        \`senha_hash\` varchar(255) NOT NULL,
        \`criado_em\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`atualizado_em\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_446adfc18b35418aac32ae0b7b\` (\`email\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`);

    await executor.query(`CREATE TABLE \`links_checkout\` (\`id\` varchar(36) NOT NULL,
        \`identificador_publico\` varchar(36) NOT NULL,
        \`usuario_id\` varchar(36) NOT NULL,
        \`valor_centavos\` int UNSIGNED NOT NULL,
        \`metodo\` enum ('PIX', 'CARTAO') NOT NULL,
        \`parcelas\` tinyint UNSIGNED NULL,
        \`bandeira\` varchar(20) NULL,
        \`taxa_aplicada_percentual\` decimal(7,4) NULL,
        \`estado\` enum ('ATIVO', 'PAGO', 'EXPIRADO', 'CANCELADO') NOT NULL DEFAULT 'ATIVO',
        \`expira_em\` datetime(6) NOT NULL,
        \`criado_em\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`atualizado_em\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_f8f4c80ea3ef77bfcdb97a9608\` (\`identificador_publico\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`);

    await executor.query(`CREATE TABLE \`saques\` (\`id\` varchar(36) NOT NULL,
        \`usuario_id\` varchar(36) NOT NULL,
        \`valor_centavos\` int UNSIGNED NOT NULL,
        \`chave_pix\` varchar(254) NOT NULL,
        \`documento_titular\` varchar(14) NOT NULL,
        \`referencia_externa\` varchar(100) NOT NULL,
        \`identificador_gateway\` varchar(100) NULL,
        \`estado\` enum ('PENDENTE', 'APROVADO', 'NEGADO') NOT NULL DEFAULT 'PENDENTE',
        \`motivo_negacao\` varchar(255) NULL,
        \`criado_em\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`atualizado_em\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_426d4788030d0972d769152a35\` (\`usuario_id\`,
        \`identificador_gateway\`),
        UNIQUE INDEX \`IDX_6de02e99d5bcc3463f1a37d96f\` (\`referencia_externa\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`);

    await executor.query(`CREATE TABLE \`transacoes\` (\`id\` varchar(36) NOT NULL,
        \`usuario_id\` varchar(36) NOT NULL,
        \`pedido_id\` varchar(36) NULL,
        \`tipo\` enum ('PIX', 'CARTAO', 'SAQUE') NOT NULL,
        \`valor_centavos\` int UNSIGNED NOT NULL,
        \`taxa_centavos\` int UNSIGNED NULL,
        \`valor_liquido_centavos\` int UNSIGNED NULL,
        \`estado\` enum ('PENDENTE', 'APROVADA', 'NEGADA', 'EXPIRADA', 'CANCELADA') NOT NULL DEFAULT 'PENDENTE',
        \`referencia_externa\` varchar(100) NULL,
        \`identificador_gateway\` varchar(100) NULL,
        \`criado_em\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`atualizado_em\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_0d58db59f3f3742958d57d8570\` (\`usuario_id\`,
        \`identificador_gateway\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`);

    await executor.query(`CREATE TABLE \`eventos_webhook\` (\`id\` varchar(36) NOT NULL,
        \`conta_gateway_id\` varchar(36) NOT NULL,
        \`tipo\` enum ('PAGAMENTO_PIX', 'PAGAMENTO_CARTAO', 'SAQUE') NOT NULL,
        \`chave_deduplicacao\` varchar(128) NOT NULL,
        \`payload\` json NOT NULL,
        \`estado\` enum ('PENDENTE', 'PROCESSADO', 'FALHOU') NOT NULL DEFAULT 'PENDENTE',
        \`processado_em\` datetime(6) NULL,
        \`recebido_em\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`atualizado_em\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_c278c3f93db7218323519c0bdb\` (\`conta_gateway_id\`,
        \`chave_deduplicacao\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`);

    await executor.query(
      `ALTER TABLE \`pedidos\` ADD CONSTRAINT \`FK_38220385a29e41833b7a36a8f63\` FOREIGN KEY (\`link_checkout_id\`) REFERENCES \`links_checkout\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await executor.query(
      `ALTER TABLE \`contas_gateway\` ADD CONSTRAINT \`FK_488b6333944722844153cc2dedd\` FOREIGN KEY (\`usuario_id\`) REFERENCES \`usuarios\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await executor.query(
      `ALTER TABLE \`links_checkout\` ADD CONSTRAINT \`FK_d5a458e525d98a2b17e4deb4cfc\` FOREIGN KEY (\`usuario_id\`) REFERENCES \`usuarios\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await executor.query(
      `ALTER TABLE \`saques\` ADD CONSTRAINT \`FK_fd30a0bf11ec9b3839f351fcd20\` FOREIGN KEY (\`usuario_id\`) REFERENCES \`usuarios\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await executor.query(
      `ALTER TABLE \`transacoes\` ADD CONSTRAINT \`FK_8cb6a1f4e77824057f799940ec7\` FOREIGN KEY (\`usuario_id\`) REFERENCES \`usuarios\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await executor.query(
      `ALTER TABLE \`transacoes\` ADD CONSTRAINT \`FK_de361f80923411f22d94eb52792\` FOREIGN KEY (\`pedido_id\`) REFERENCES \`pedidos\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await executor.query(
      `ALTER TABLE \`eventos_webhook\` ADD CONSTRAINT \`FK_ff9f9792c7050f6c79f3829d203\` FOREIGN KEY (\`conta_gateway_id\`) REFERENCES \`contas_gateway\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  async down(executor: QueryRunner): Promise<void> {
    // Remove as chaves estrangeiras antes de excluir as tabelas.
    await executor.query(
      `ALTER TABLE \`eventos_webhook\` DROP FOREIGN KEY \`FK_ff9f9792c7050f6c79f3829d203\``,
    );

    await executor.query(
      `ALTER TABLE \`transacoes\` DROP FOREIGN KEY \`FK_de361f80923411f22d94eb52792\``,
    );

    await executor.query(
      `ALTER TABLE \`transacoes\` DROP FOREIGN KEY \`FK_8cb6a1f4e77824057f799940ec7\``,
    );

    await executor.query(
      `ALTER TABLE \`saques\` DROP FOREIGN KEY \`FK_fd30a0bf11ec9b3839f351fcd20\``,
    );

    await executor.query(
      `ALTER TABLE \`links_checkout\` DROP FOREIGN KEY \`FK_d5a458e525d98a2b17e4deb4cfc\``,
    );

    await executor.query(
      `ALTER TABLE \`contas_gateway\` DROP FOREIGN KEY \`FK_488b6333944722844153cc2dedd\``,
    );

    await executor.query(
      `ALTER TABLE \`pedidos\` DROP FOREIGN KEY \`FK_38220385a29e41833b7a36a8f63\``,
    );

    await executor.query(`DROP TABLE \`eventos_webhook\``);

    await executor.query(`DROP TABLE \`transacoes\``);

    await executor.query(`DROP TABLE \`saques\``);

    await executor.query(`DROP TABLE \`links_checkout\``);

    await executor.query(`DROP TABLE \`usuarios\``);

    await executor.query(`DROP TABLE \`contas_gateway\``);

    await executor.query(`DROP TABLE \`pedidos\``);
  }
}
