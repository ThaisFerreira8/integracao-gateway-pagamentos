import {
  BadGatewayException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { SaquesService } from './saques.service';
import { Saque, EstadoSaque } from './entities/saque.entity';
import { ContasGatewayService } from '../contas-gateway/contas-gateway.service';
import { GatewayHttpService } from '../contas-gateway/gateway-http.service';

describe('Solicitação e conciliação de saques com gateway simulado', () => {
  const contas = { obterToken: jest.fn() };
  const gateway = { requisitar: jest.fn() };
  const executor = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };
  const repositorio = {
    create: jest.fn((valor: unknown) => valor),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => executor),
  };
  const servico = new SaquesService(
    repositorio as unknown as Repository<Saque>,
    contas as unknown as ContasGatewayService,
    gateway as unknown as GatewayHttpService,
  );
  const entrada = {
    valorCentavos: 100,
    chavePix: 'evp-ficticia',
    documentoTitular: '12345678901',
    referenciaExterna: 'SAQUE-local',
  };
  const resposta = {
    id: 'saque-externo',
    type: 'WITHDRAWAL',
    status: 'APPROVED',
    amount: 100,
    createdAt: '2026-10-10T12:00:00.000Z',
    metadata: {
      externalReference: 'SAQUE-local',
      pixKey: 'NAO-EXPOR',
      document: 'NAO-EXPOR',
      ChaveLoja: 'NAO-EXPOR',
    },
  };
  beforeEach(() => {
    jest.clearAllMocks();
    contas.obterToken.mockResolvedValue('token-apenas-mock');
    repositorio.save.mockImplementation(async (valor: unknown) => valor);
    gateway.requisitar.mockResolvedValue(resposta);
    executor.execute.mockResolvedValue({ affected: 1 });
    repositorio.findOne.mockResolvedValue({
      id: 'saque-local',
      usuarioId: 'lojista',
      valorCentavos: 100,
      referenciaExterna: 'SAQUE-local',
      estado: EstadoSaque.PENDENTE,
      identificadorGateway: 'saque-externo',
    });
  });
  it('persiste reserva antes do POST e não retorna chave Pix ou documento', async () => {
    gateway.requisitar.mockImplementationOnce(async () => {
      expect(repositorio.save).toHaveBeenCalledTimes(1);
      return resposta;
    });
    const retorno = await servico.solicitar('lojista', entrada);
    expect(retorno.estado).toBe(EstadoSaque.APROVADO);
    expect(JSON.stringify(retorno)).not.toContain('12345678901');
    expect(JSON.stringify(retorno)).not.toContain('evp-ficticia');
    expect(gateway.requisitar).toHaveBeenCalledWith('POST', '/withdrawals', {
      token: 'token-apenas-mock',
      corpo: {
        amount: 100,
        pixKey: 'evp-ficticia',
        document: '12345678901',
        externalReference: 'SAQUE-local',
      },
    });
  });
  it('referência já reservada não gera segundo POST', async () => {
    repositorio.save.mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' });
    await expect(servico.solicitar('lojista', entrada)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(gateway.requisitar).not.toHaveBeenCalled();
  });
  it('falha do gateway conserva a reserva pendente', async () => {
    gateway.requisitar.mockRejectedValueOnce(new Error('Falha simulada'));
    await expect(servico.solicitar('lojista', entrada)).rejects.toThrow();
    expect(repositorio.save).toHaveBeenCalledWith(
      expect.objectContaining({
        estado: EstadoSaque.PENDENTE,
        identificadorGateway: null,
      }),
    );
    expect(executor.execute).not.toHaveBeenCalled();
  });
  it('rejeita referência ou valor externo divergente', async () => {
    gateway.requisitar.mockResolvedValueOnce({ ...resposta, amount: 200 });
    await expect(servico.solicitar('lojista', entrada)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(executor.execute).not.toHaveBeenCalled();
  });
  it('consulta externa procura UUID local e proprietário juntos', async () => {
    await servico.consultarExterno('lojista', 'saque-local');
    expect(repositorio.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'saque-local', usuarioId: 'lojista' },
      }),
    );
    expect(gateway.requisitar).toHaveBeenCalledWith(
      'GET',
      '/withdrawals/saque-externo',
      { token: 'token-apenas-mock' },
    );
  });
  it('saque alheio não consulta gateway', async () => {
    repositorio.findOne.mockResolvedValueOnce(null);
    await expect(
      servico.consultarExterno('outro', 'saque-local'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(gateway.requisitar).not.toHaveBeenCalled();
  });
  it('estado não suportado é rejeitado sem mapeamento falso', async () => {
    gateway.requisitar.mockResolvedValueOnce({
      ...resposta,
      status: 'EXPIRED',
    });
    await expect(
      servico.consultarExterno('lojista', 'saque-local'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
  it('atualização concorrente divergente não sobrescreve estado terminal', async () => {
    executor.execute.mockResolvedValueOnce({ affected: 0 });
    await expect(
      servico.consultarExterno('lojista', 'saque-local'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
