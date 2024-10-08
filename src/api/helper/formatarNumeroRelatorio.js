function formatarNumeroRelatorio(wppUserNumero) {
    let numeroFormatado
    let numeroLocal = wppUserNumero.substring(2)
    if(numeroLocal.length === 11) {
        numeroFormatado = `(${numeroLocal.substring(0,2)}) ${numeroLocal.substring(2,7)}-${numeroLocal.substring(7)}`
    } else if(numeroLocal.length === 10) {
        numeroFormatado = `(${numeroLocal.substring(0,2)}) ${numeroLocal.substring(2,6)}-${numeroLocal.substring(6)}`
    } else {
        numeroFormatado = wppUserNumero
    }
    return numeroFormatado
}

module.exports = {
    formatarNumeroRelatorio
}