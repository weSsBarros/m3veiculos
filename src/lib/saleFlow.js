import { registerTradeIn, updateCarStatus, updateCarCustomer } from './carsApi.js'
import { saveSaleForCar } from './salesApi.js'
import { closeReservation } from './reservationsApi.js'

// Registra (ou edita) a venda de um carro a partir da janela de venda:
// 1. carro recebido na troca entra no estoque (a venda guarda qual foi);
// 2. grava a venda — antes do status, para o carro não ficar "vendido" sem
//    venda se ela for recusada (ex.: vendedor registrando no nome de outro);
// 3. marca o carro como vendido (ou só troca o comprador);
// 4. reserva ativa daquele carro vira venda.
// insertOnly: o vendedor só registra venda nova.
// Devolve { sale, car, tradeInCarId }.
export async function registerSaleFromDialog(car, data, { reservation = null, insertOnly = false } = {}) {
  const { sellerId, customerId, salePrice, saleDate, checklist, payment, tradeIn } = data
  let tradeInCarId = null
  if (tradeIn) tradeInCarId = await registerTradeIn(tradeIn)

  let sale
  try {
    sale = await saveSaleForCar(car.id, {
      sellerId,
      salePrice,
      saleDate,
      checklist,
      payment,
      ...(tradeInCarId ? { tradeIn: { carId: tradeInCarId, value: tradeIn.value } } : {}),
      insertOnly,
    })
  } catch (err) {
    if (tradeInCarId) err.message += ' (o carro da troca já foi cadastrado no estoque)'
    throw err
  }

  let soldCar = car
  if (car.status !== 'vendido') {
    soldCar = await updateCarStatus(car.id, 'vendido', { saleDate, customerId })
  } else if ((car.customerId || null) !== (customerId || null)) {
    soldCar = await updateCarCustomer(car.id, customerId)
  }
  if (reservation) await closeReservation(reservation.id, 'convertida').catch(() => {})
  return { sale, car: soldCar, tradeInCarId }
}
