# alertaCobranza (Cloud Run, proyecto odfor-bae97, us-central1)

Copia de referencia del codigo que corre en produccion. NO se despliega desde aqui:
la funcion se edita y despliega desde la consola de Google Cloud (Cloud Run > alertacobranza > Fuente).
Cada vez que se cambie en la consola, actualizar esta copia (boton "Descargar archivo").

- Descargado: 2026-09-03 (revision alertacobranza-00012-vdh, codigo identico al de la revision 00010 del 14-08).
- Secreto KOMMO_TOKEN: Secret Manager, montado como variable de entorno con version `latest` (desde 03-09-2026).
  Para rotar el token: crear version nueva en Secret Manager y "Volver a implementar" en Cloud Run.
- Resultados posibles por lead (solo quedan en los logs de Cloud Run):
  avisado(n/200) | ya_avisado | sin_rut | sin_deuda | bajo_umbral | simulado | tope_diario | kommo_<status> | error_nota_<status> | error

## Chequeo de salud (creado 2026-09-03)
- Metrica basada en registros: `alertacobranza_errores` (Cloud Logging).
- Politica de alerta: "Fodor SpA - alertaCobranza con errores (Kommo)" (Monitoring > Alertas > Politicas).
  Filtro: resource.type="cloud_run_revision" resource.labels.service_name="alertacobranza" textPayload:"[cobranza]"
  (textPayload:":kommo_" OR textPayload:":error_nota_" OR textPayload:":error" OR textPayload:"error general")
  Notifica a: canal Email "Deborah - correo" (byfodor@gmail.com). Maximo 1 correo por hora. Cierre automatico: 7 dias.
  La documentacion de la alerta trae los pasos para renovar el token.
- Para desactivarla: Monitoring > Alertas > Politicas > interruptor "Habilitada".
