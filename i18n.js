/* -------------------------------------------
   INTERNATIONALISATION (i18n)
   Loaded first — exposes t(), setLang() and
   onLangChange() globally to all other scripts.
------------------------------------------- */

const I18N = {
  es: {
    /* ── Header ── */
    devMode_aria:          'Modo desarrollador',
    devMode_label:         'Dev',
    devMode_label_active:  'Dev ●',
    theme_aria:            'Cambiar tema',
    theme_to_light:        'Claro',
    theme_to_dark:         'Oscuro',

    /* ── Tabs ── */
    tab_search_text:  'Búsqueda',
    tab_saved_text:   'Guardados',
    tab_logs_text:    'Logs',

    /* ── Search form ── */
    search_title:              'Buscar vuelos de ida',
    label_date_from:           'Fecha inicio',
    label_date_to:             'Fecha fin',
    label_days:                'Días de la semana',
    label_days_hint:           'sin marcar = todos los días',
    label_origin:              'Origen',
    label_dest:                'Destino',
    airport_placeholder:       'Seleccionar\u2026',
    airport_filter_ph:         'Filtrar aeropuerto\u2026',
    label_simple_search:       'Búsqueda simple',
    simple_search_mobile_warn: '⚠️ La búsqueda simple es recomendada en móviles. El mapa puede ser difícil de usar.',
    label_max_stops:           'Máximo de escalas',
    stops_0:                   'Sin escalas',
    stops_1:                   '1 escala',
    stops_2:                   '2 escalas',
    stops_3:                   '3 escalas',
    btn_search:                '🔍 Buscar vuelos',
    btn_searching:             'Buscando\u2026',
    btn_import:                '📂 Importar resultados',
    advanced_toggle:           '⚙ Ajustes avanzados',
    label_max_results:         'Máximo de vuelos por ruta',
    results_placeholder:       'Los resultados aparecerán aquí',

    /* ── Airport selector (dynamic) ── */
    no_results:       'Sin resultados',
    select_all:       '+ Todos',
    deselect_all:     '\u2212 Quitar',
    trigger_ph:       'Seleccionar\u2026',
    map_pick_country:      'Elige un país en el mapa',
    map_search_placeholder: 'Buscar aeropuerto\u2026',
    continent_EU: 'Europa',
    continent_AM: 'América',
    continent_AS: 'Asia',
    continent_AF: 'África',
    trigger_more:     n => `+${n} más`,
    tag_remove_aria:  iata => `Quitar ${iata}`,

    /* ── Validation alerts ── */
    alert_dates:   'Por favor, selecciona las fechas de inicio y fin.',
    alert_origin:  'Añade al menos un aeropuerto de origen.',
    alert_dest:    'Añade al menos un aeropuerto de destino.',

    /* ── Spinner ── */
    spinner_msg:       'Buscando vuelos',
    spinner_init:      'Iniciando búsqueda\u2026',
    spinner_no_close:  'No cierres esta pestaña.',
    wakeup_msg:        '⏳ Arrancando el servidor… esto puede tardar hasta 30 segundos.',
    spinner_remaining: s => `\u223c ${s} s restantes`,

    /* ── Results ── */
    no_flights:           'No se encontraron vuelos.',
    no_match_filters:     'Ningún vuelo coincide con los filtros.',
    flights_found:        n => `${n} vuelo${n !== 1 ? 's' : ''} encontrado${n !== 1 ? 's' : ''}`,
    flights_found_t:      (n, s) => `${n} vuelo${n !== 1 ? 's' : ''} encontrado${n !== 1 ? 's' : ''} <span class="results-elapsed">(${s} s)</span>`,
    route_flights:        n => `${n} vuelo${n !== 1 ? 's' : ''}`,
    route_tab_all:        'Todos',
    route_tab_all_dest:   'Todos (por destino)',
    badge_direct:         'Directo',
    badge_stops:          n => `${n} escala${n > 1 ? 's' : ''}`,
    badge_best:           '✦ Mejor precio',
    save_title_save:      'Guardar vuelo',
    save_title_saved:     'Quitar de guardados',
    btn_return_short:     '↩ Vuelta',
    btn_return_title:     'Buscar vuelo de vuelta',
    btn_select_return:    '✓ Elegir vuelta',
    btn_select_title:     'Elegir como vuelo de vuelta',
    book_btn_text:        '↗ Enlace',
    book_btn_title:       'Ver vuelo en Google Flights',

    /* ── Filter bar ── */
    filter_title:        '🔧 Filtrar y ordenar',
    filter_return_title: '🔧 Filtrar y ordenar vuelta',
    filter_reset:        'Restablecer',
    filter_sec_dates:    '📅 Fechas y precio',
    filter_sec_times:    '🕐 Horarios',
    filter_sec_flight:   '✈️ Vuelo',
    filter_from:         'Desde',
    filter_to:           'Hasta',
    filter_max_price:    'Precio máx.',
    filter_dep:          'Salida:',
    filter_arr:          'Llegada:',
    filter_dep_days:     'Días de salida',
    filter_arr_days:     'Días de llegada',
    filter_stops_label:  'Escalas',
    filter_all:          'Todas',
    filter_all_m:        'Todos',
    filter_airline:      'Aerolínea',
    filter_sort:         'Ordenar por',
    filter_dest_label:   'Destino',
    sort_date_asc:       'Fecha ↑',
    sort_date_desc:      'Fecha ↓',
    sort_price_asc:      'Precio ↑',
    sort_price_desc:     'Precio ↓',
    sort_dur_asc:        'Duración ↑',
    sort_stops_asc:      'Escalas ↑',
    sort_dep_asc:        'Salida ↑',
    sort_dep_desc:       'Salida ↓',
    sort_arr_asc:        'Llegada ↑',
    sort_arr_desc:       'Llegada ↓',

    /* ── Saved ── */
    storage_full:          'No se pudo guardar: el almacenamiento local está lleno. Elimina algunas búsquedas guardadas e inténtalo de nuevo.',
    save_btn_save:         '♡ Guardar',
    save_btn_saved:        '♥ Guardado',
    no_saved_flights:      'No tienes vuelos guardados todavía.',
    no_saved_hint:         'Haz clic en \u201cGuardar\u201d en cualquier vuelo de los resultados.',
    saved_flights_count:   n => `${n} vuelo${n !== 1 ? 's' : ''} guardado${n !== 1 ? 's' : ''}`,
    btn_save_search:       '💾 Guardar',
    btn_download_json:     '⬇ JSON',
    btn_save_done:         '✓ Guardado',
    saved_searches_title:  '📦 Búsquedas guardadas',
    ss_load:               '↩ Cargar',
    ss_rename:             '✏ Renombrar',
    ss_del:                '✕',
    ss_load_title:         'Haz clic para cargar',
    ss_flights_count:      (n, date) => `${n} vuelo${n !== 1 ? 's' : ''} · ${date}`,

    /* ── Refresh saved flight ── */
    refresh_btn_title:  'Actualizar precio desde el backend',
    refresh_no_change:  '= Sin cambios',
    refresh_not_found:  '? No disponible',
    refresh_price_was:  prev => `antes: ${prev}`,

    /* ── Express trip ── */
    tab_express_text:       'Exprés',
    express_title:          'Viaje Exprés',
    express_subtitle:       'Ida por la mañana (04:00–11:59) · Vuelta por la tarde/noche del mismo día',
    btn_express_search:     '⚡ Buscar viaje exprés',
    express_searching_out:  'Buscando vuelos de ida…',
    express_searching_ret:  'Buscando vuelos de vuelta…',
    express_no_trips:       'No hay viajes exprés disponibles para las fechas y rutas seleccionadas.',
    express_trips_found:    (n, s) => `${n} viaje${n !== 1 ? 's' : ''} exprés encontrado${n !== 1 ? 's' : ''} <span class="results-elapsed">(${s} s)</span>`,
    express_total:          'Total:',
    express_leg_out:        'Ida (mañana)',
    express_leg_ret:        'Vuelta (tarde/noche)',
    express_opts:           n => `${n} opción${n !== 1 ? 'es' : ''}`,
    express_filter_max_total:   'Precio total máx.',
    express_filter_dest_out: 'Destino ida',
    express_filter_dest_ret: 'Destino vuelta',
    express_sort_total_asc:     'Total ↑',
    express_sort_total_desc:    'Total ↓',
    saved_express_title:        '⚡ Rutas Exprés Guardadas',
    btn_import_express:         '📂 Importar exprés',
    ex_ss_trips_count:          (n, date) => `${n} viaje${n !== 1 ? 's' : ''} · ${date}`,
    ex_combine_btn:             '⊕ Elegir',
    ex_combine_btn_selected:    '✓ Elegido',
    ex_combine_hint:            '¡Ahora selecciona el otro vuelo para combinarlos!',
    ex_combine_cancel:          '✕ Cancelar',
    ex_combine_wrong_dir:       'Selecciona un vuelo de ida (mañana) y uno de vuelta (tarde/noche).',
    ex_combine_title:           '⚡ Viaje Exprés Combinado',

    /* ── Logs ── */
    log_level_label:  'Nivel',
    log_opt_0:        '0 \u2014 Silencio',
    log_opt_1:        '1 \u2014 Error',
    log_opt_2:        '2 \u2014 Info',
    log_opt_3:        '3 \u2014 Verbose',
    log_opt_4:        '4 \u2014 Debug',
    log_pause:        '⏸ Pausar',
    log_resume:       '▶ Reanudar',
    log_clear:        '🗑 Limpiar',
    log_copy:         '📋 Copiar',
    log_copied:       '✅ Copiado',
    log_placeholder:  'Abre esta pestaña con el servidor corriendo para ver los logs en tiempo real.',

    /* ── Return flight ── */
    ts_title:        '✈ Viaje seleccionado',
    ts_outbound:     '✈ Ida',
    ts_return_leg:   '↩ Vuelta',
    ts_total:        'Total estimado',
    ts_save_both:    '♥ Guardar ambos vuelos',
    ts_saved_both:   '♥ Guardados',
    ts_close:        'Cerrar',
    rm_title:        '↩ Buscar vuelo de vuelta',
    rm_selected:     'Ida seleccionada:',
    rm_min_days:     'Mínimo de días de estancia',
    rm_max_days:     'Máximo de días de estancia',
    rm_search:       '🔍 Buscar vuelta',
    rm_from:         'Desde (origen vuelta)',
    rm_to:           'Hasta (destino vuelta)',
    rm_no_airports:  'Selecciona al menos un aeropuerto de origen y uno de destino.',
    rs_title:        (dst, ori) => `↩ Vuelta \u2014 ${dst} \u2192 ${ori}`,
    rs_sub:          (dateLbl, stay) => `Basada en ida del ${dateLbl} · estancia ${stay}`,
    rs_close:        '× Cerrar',
    stay_days:       n => `${n} día${n !== 1 ? 's' : ''}`,
    stay_range:      (a, b) => `${a}\u2013${b} días`,
    conn_error:      'No se pudo conectar con el backend.',
    conn_error_full: 'No se pudo conectar con el servidor. Inténtalo de nuevo en unos segundos.',
    import_invalid:  'El archivo no es un JSON de exprés válido.',

    /* ── Date presets ── */
    date_presets_toggle:  '📅 Selección rápida de fechas',
    preset_this_weekend:  'Este fin de semana',
    preset_next_weekend:  'Próximo fin de semana',
    preset_this_month:    'Este mes',
    preset_next_month:    'Próximo mes',
    preset_next_2weeks:   'Próximas 2 semanas',
    preset_next_4weeks:   'Próximas 4 semanas',
    preset_next_2months:  'Próximos 2 meses',
    preset_next_3months:  'Próximos 3 meses',
    preset_single_month:  '📅 Mes entero',
    preset_full_month:    '📆 Rango de meses',
    preset_full_month_ph: 'Elige mes y año',
    preset_range_from:    'Desde',
    preset_range_to:      'Hasta',

    /* ── Date/time ── */
    weekdays: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    months:   ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
    locale_tag: 'es-ES',

    /* ── Airport filter checkbox ── */
    label_show_all_airports:         'Ver todos los aeropuertos',
    tooltip_show_all_airports:       'Por defecto solo se muestran aeropuertos relevantes (importancia 3–5). Activa esta opción para ver también aeropuertos pequeños, regionales y privados.',

    /* ── Countries ── */
    country_AE: 'Emiratos Árabes', country_AF: 'Afganistán',     country_AG: 'Antigua y Barbuda',
    country_AI: 'Anguila',         country_AL: 'Albania',        country_AM: 'Armenia',
    country_AO: 'Angola',          country_AQ: 'Antártida',      country_AR: 'Argentina',
    country_AS: 'Samoa Americana', country_AT: 'Austria',        country_AU: 'Australia',
    country_AW: 'Aruba',           country_AZ: 'Azerbaiyán',     country_BA: 'Bosnia y Herzegovina',
    country_BB: 'Barbados',        country_BD: 'Bangladés',      country_BE: 'Bélgica',
    country_BF: 'Burkina Faso',    country_BG: 'Bulgaria',       country_BH: 'Baréin',
    country_BI: 'Burundi',         country_BJ: 'Benín',          country_BL: 'San Bartolomé',
    country_BM: 'Bermudas',        country_BN: 'Brunéi',         country_BO: 'Bolivia',
    country_BQ: 'Caribe Neerlandés',country_BR: 'Brasil',        country_BS: 'Bahamas',
    country_BT: 'Bután',           country_BW: 'Botsuana',       country_BY: 'Bielorrusia',
    country_BZ: 'Belice',          country_CA: 'Canadá',         country_CC: 'Islas Cocos',
    country_CD: 'Congo (RDC)',     country_CF: 'Rep. Centroafricana', country_CG: 'Congo',
    country_CH: 'Suiza',           country_CI: 'Costa de Marfil',country_CK: 'Islas Cook',
    country_CL: 'Chile',           country_CM: 'Camerún',        country_CN: 'China',
    country_CO: 'Colombia',        country_CR: 'Costa Rica',     country_CU: 'Cuba',
    country_CV: 'Cabo Verde',      country_CW: 'Curazao',        country_CX: 'Isla de Navidad',
    country_CY: 'Chipre',          country_CZ: 'Rep. Checa',     country_DE: 'Alemania',
    country_DJ: 'Yibuti',          country_DK: 'Dinamarca',      country_DM: 'Dominica',
    country_DO: 'Rep. Dominicana', country_DZ: 'Argelia',        country_EC: 'Ecuador',
    country_EE: 'Estonia',         country_EG: 'Egipto',         country_EH: 'Sáhara Occidental',
    country_ER: 'Eritrea',         country_ES: 'España',         country_ET: 'Etiopía',
    country_FI: 'Finlandia',       country_FJ: 'Fiyi',           country_FK: 'Islas Malvinas',
    country_FM: 'Micronesia',      country_FO: 'Islas Feroe',    country_FR: 'Francia',
    country_GA: 'Gabón',           country_GB: 'Reino Unido',    country_GD: 'Granada',
    country_GE: 'Georgia',         country_GF: 'Guayana Francesa',country_GG: 'Guernsey',
    country_GH: 'Ghana',           country_GI: 'Gibraltar',      country_GL: 'Groenlandia',
    country_GM: 'Gambia',          country_GN: 'Guinea',         country_GP: 'Guadalupe',
    country_GQ: 'Guinea Ecuatorial',country_GR: 'Grecia',        country_GT: 'Guatemala',
    country_GU: 'Guam',            country_GW: 'Guinea-Bisáu',   country_GY: 'Guyana',
    country_HK: 'Hong Kong',       country_HN: 'Honduras',       country_HR: 'Croacia',
    country_HT: 'Haití',           country_HU: 'Hungría',        country_ID: 'Indonesia',
    country_IE: 'Irlanda',         country_IL: 'Israel',         country_IM: 'Isla de Man',
    country_IN: 'India',           country_IQ: 'Irak',           country_IR: 'Irán',
    country_IS: 'Islandia',        country_IT: 'Italia',         country_JE: 'Jersey',
    country_JM: 'Jamaica',         country_JO: 'Jordania',       country_JP: 'Japón',
    country_KE: 'Kenia',           country_KG: 'Kirguistán',     country_KH: 'Camboya',
    country_KI: 'Kiribati',        country_KM: 'Comoras',        country_KN: 'San Cristóbal y Nieves',
    country_KP: 'Corea del Norte', country_KR: 'Corea del Sur',  country_KW: 'Kuwait',
    country_KY: 'Islas Caimán',    country_KZ: 'Kazajistán',     country_LA: 'Laos',
    country_LB: 'Líbano',          country_LC: 'Santa Lucía',    country_LK: 'Sri Lanka',
    country_LR: 'Liberia',         country_LS: 'Lesoto',         country_LT: 'Lituania',
    country_LU: 'Luxemburgo',      country_LV: 'Letonia',        country_LY: 'Libia',
    country_MA: 'Marruecos',       country_MD: 'Moldavia',       country_ME: 'Montenegro',
    country_MF: 'San Martín (Fr)', country_MG: 'Madagascar',     country_MH: 'Islas Marshall',
    country_MK: 'Macedonia Norte', country_ML: 'Malí',           country_MM: 'Myanmar',
    country_MN: 'Mongolia',        country_MO: 'Macao',          country_MP: 'Islas Marianas del Norte',
    country_MQ: 'Martinica',       country_MR: 'Mauritania',     country_MS: 'Montserrat',
    country_MT: 'Malta',           country_MU: 'Mauricio',       country_MV: 'Maldivas',
    country_MW: 'Malaui',          country_MX: 'México',         country_MY: 'Malasia',
    country_MZ: 'Mozambique',      country_NA: 'Namibia',        country_NC: 'Nueva Caledonia',
    country_NE: 'Níger',           country_NF: 'Isla Norfolk',   country_NG: 'Nigeria',
    country_NI: 'Nicaragua',       country_NL: 'Países Bajos',   country_NO: 'Noruega',
    country_NP: 'Nepal',           country_NR: 'Nauru',          country_NU: 'Niue',
    country_NZ: 'Nueva Zelanda',   country_OM: 'Omán',           country_PA: 'Panamá',
    country_PE: 'Perú',            country_PF: 'Polinesia Francesa', country_PG: 'Papúa Nueva Guinea',
    country_PH: 'Filipinas',       country_PK: 'Pakistán',       country_PL: 'Polonia',
    country_PM: 'San Pedro y Miquelón', country_PR: 'Puerto Rico', country_PT: 'Portugal',
    country_PW: 'Palaos',          country_PY: 'Paraguay',       country_QA: 'Qatar',
    country_RE: 'Reunión',         country_RO: 'Rumania',        country_RS: 'Serbia',
    country_RU: 'Rusia',           country_RW: 'Ruanda',         country_SA: 'Arabia Saudí',
    country_SB: 'Islas Salomón',   country_SC: 'Seychelles',     country_SD: 'Sudán',
    country_SE: 'Suecia',          country_SG: 'Singapur',       country_SH: 'Santa Elena',
    country_SI: 'Eslovenia',       country_SK: 'Eslovaquia',     country_SL: 'Sierra Leona',
    country_SN: 'Senegal',         country_SO: 'Somalia',        country_SR: 'Surinam',
    country_SS: 'Sudán del Sur',   country_ST: 'Santo Tomé y Príncipe', country_SV: 'El Salvador',
    country_SX: 'Sint Maarten',    country_SY: 'Siria',          country_SZ: 'Esuatini',
    country_TC: 'Islas Turcas y Caicos', country_TD: 'Chad',     country_TG: 'Togo',
    country_TH: 'Tailandia',       country_TJ: 'Tayikistán',     country_TL: 'Timor Oriental',
    country_TM: 'Turkmenistán',    country_TN: 'Túnez',          country_TO: 'Tonga',
    country_TR: 'Turquía',         country_TT: 'Trinidad y Tobago', country_TV: 'Tuvalu',
    country_TW: 'Taiwán',          country_TZ: 'Tanzania',       country_UA: 'Ucrania',
    country_UG: 'Uganda',          country_UM: 'Islas Ultramarinas de EE.UU.', country_US: 'Estados Unidos',
    country_AK: 'Alaska',          country_UY: 'Uruguay',        country_UZ: 'Uzbekistán',
    country_VC: 'San Vicente y las Granadinas', country_VE: 'Venezuela', country_VG: 'Islas Vírgenes Británicas',
    country_VN: 'Vietnam',         country_VU: 'Vanuatu',        country_WF: 'Wallis y Futuna',
    country_WS: 'Samoa',           country_XK: 'Kosovo',         country_YE: 'Yemen',
    country_YT: 'Mayotte',         country_ZA: 'Sudáfrica',      country_ZM: 'Zambia',
    country_ZW: 'Zimbabue',
  },

  en: {
    /* ── Header ── */
    devMode_aria:          'Developer mode',
    devMode_label:         'Dev',
    devMode_label_active:  'Dev ●',
    theme_aria:            'Toggle theme',
    theme_to_light:        'Light',
    theme_to_dark:         'Dark',

    /* ── Tabs ── */
    tab_search_text:  'Search',
    tab_saved_text:   'Saved',
    tab_logs_text:    'Logs',

    /* ── Search form ── */
    search_title:              'Search flights (One-way)',
    label_date_from:           'Start date',
    label_date_to:             'End date',
    label_days:                'Days of the week',
    label_days_hint:           'none selected = all days',
    label_origin:              'Origin',
    label_dest:                'Destination',
    airport_placeholder:       'Select\u2026',
    airport_filter_ph:         'Filter airport\u2026',
    label_simple_search:       'Simple search',
    simple_search_mobile_warn: '⚠️ Simple search is recommended on mobile. The map can be hard to use.',
    label_max_stops:           'Maximum stops',
    stops_0:                   'Non-stop',
    stops_1:                   '1 stop',
    stops_2:                   '2 stops',
    stops_3:                   '3 stops',
    btn_search:                '🔍 Search flights',
    btn_searching:             'Searching\u2026',
    btn_import:                '📂 Import results',
    advanced_toggle:           '⚙ Advanced settings',
    label_max_results:         'Max flights per route',
    results_placeholder:       'Results will appear here',

    /* ── Airport selector (dynamic) ── */
    no_results:       'No results',
    select_all:       '+ All',
    deselect_all:     '\u2212 Remove',
    trigger_ph:       'Select\u2026',
    map_pick_country:      'Pick a country on the map',
    map_search_placeholder: 'Search airport\u2026',
    continent_EU: 'Europe',
    continent_AM: 'Americas',
    continent_AS: 'Asia',
    continent_AF: 'Africa',
    trigger_more:     n => `+${n} more`,
    tag_remove_aria:  iata => `Remove ${iata}`,

    /* ── Validation alerts ── */
    alert_dates:   'Please select start and end dates.',
    alert_origin:  'Add at least one origin airport.',
    alert_dest:    'Add at least one destination airport.',

    /* ── Spinner ── */
    spinner_msg:       'Searching flights.',
    spinner_init:      'Starting search\u2026',
    spinner_no_close:  "Don't close this tab.",
    wakeup_msg:        '⏳ Waking up the server… this may take up to 30 seconds.',
    spinner_remaining: s => `\u223c ${s} s remaining`,

    /* ── Results ── */
    no_flights:           'No flights found.',
    no_match_filters:     'No flights match the current filters.',
    flights_found:        n => `${n} flight${n !== 1 ? 's' : ''} found`,
    flights_found_t:      (n, s) => `${n} flight${n !== 1 ? 's' : ''} found <span class="results-elapsed">(${s} s)</span>`,
    route_flights:        n => `${n} flight${n !== 1 ? 's' : ''}`,
    route_tab_all:        'All',
    route_tab_all_dest:   'All (by destination)',
    badge_direct:         'Non-stop',
    badge_stops:          n => `${n} stop${n > 1 ? 's' : ''}`,
    badge_best:           '✦ Best price',
    save_title_save:      'Save flight',
    save_title_saved:     'Remove from saved',
    btn_return_short:     '↩ Return',
    btn_return_title:     'Search return flight',
    btn_select_return:    '✓ Select return',
    btn_select_title:     'Select as return flight',
    book_btn_text:        '↗ Link',
    book_btn_title:       'View flight on Google Flights',

    /* ── Filter bar ── */
    filter_title:        '🔧 Filter & sort',
    filter_return_title: '🔧 Filter & sort return',
    filter_reset:        'Reset',
    filter_sec_dates:    '📅 Dates & price',
    filter_sec_times:    '🕐 Times',
    filter_sec_flight:   '✈️ Flight',
    filter_from:         'From',
    filter_to:           'To',
    filter_max_price:    'Max price',
    filter_dep:          'Departure:',
    filter_arr:          'Arrival:',
    filter_dep_days:     'Departure days',
    filter_arr_days:     'Arrival days',
    filter_stops_label:  'Stops',
    filter_all:          'All',
    filter_all_m:        'All',
    filter_airline:      'Airline',
    filter_sort:         'Sort by',
    filter_dest_label:   'Destination',
    sort_date_asc:       'Date ↑',
    sort_date_desc:      'Date ↓',
    sort_price_asc:      'Price ↑',
    sort_price_desc:     'Price ↓',
    sort_dur_asc:        'Duration ↑',
    sort_stops_asc:      'Stops ↑',
    sort_dep_asc:        'Departure ↑',
    sort_dep_desc:       'Departure ↓',
    sort_arr_asc:        'Arrival ↑',
    sort_arr_desc:       'Arrival ↓',

    /* ── Saved ── */
    storage_full:          'Could not save: local storage is full. Delete some saved searches and try again.',
    save_btn_save:         '♡ Save',
    save_btn_saved:        '♥ Saved',
    no_saved_flights:      'You have no saved flights yet.',
    no_saved_hint:         'Click \u201cSave\u201d on any flight in the results.',
    saved_flights_count:   n => `${n} saved flight${n !== 1 ? 's' : ''}`,
    btn_save_search:       '💾 Save',
    btn_download_json:     '⬇ JSON',
    btn_save_done:         '✓ Saved',
    saved_searches_title:  '📦 Saved searches',
    ss_load:               '↩ Load',
    ss_rename:             '✏ Rename',
    ss_del:                '✕',
    ss_load_title:         'Click to load',
    ss_flights_count:      (n, date) => `${n} flight${n !== 1 ? 's' : ''} · ${date}`,

    /* ── Refresh saved flight ── */
    refresh_btn_title:  'Refresh price from backend',
    refresh_no_change:  '= No change',
    refresh_not_found:  '? Not available',
    refresh_price_was:  prev => `was: ${prev}`,

    /* ── Express trip ── */
    tab_express_text:       'Express',
    express_title:          'Express Trip',
    express_subtitle:       'Morning outbound (04:00–11:59) · Same-day return afternoon/evening',
    btn_express_search:     '⚡ Search express trip',
    express_searching_out:  'Searching outbound flights…',
    express_searching_ret:  'Searching return flights…',
    express_no_trips:       'No express trips available for the selected dates and routes.',
    express_trips_found:    (n, s) => `${n} express trip${n !== 1 ? 's' : ''} found <span class="results-elapsed">(${s} s)</span>`,
    express_total:          'Total:',
    express_leg_out:        'Outbound (morning)',
    express_leg_ret:        'Return (afternoon/evening)',
    express_opts:           n => `${n} option${n !== 1 ? 's' : ''}`,
    express_filter_max_total:   'Max total price',
    express_filter_dest_out: 'Outbound destination',
    express_filter_dest_ret: 'Return destination',
    express_sort_total_asc:     'Total ↑',
    express_sort_total_desc:    'Total ↓',
    saved_express_title:        '⚡ Saved Express Routes',
    btn_import_express:         '📂 Import express',
    ex_ss_trips_count:          (n, date) => `${n} trip${n !== 1 ? 's' : ''} · ${date}`,
    ex_combine_btn:             '⊕ Choose',
    ex_combine_btn_selected:    '✓ Selected',
    ex_combine_hint:            'Now select the other flight to combine them!',
    ex_combine_cancel:          '✕ Cancel',
    ex_combine_wrong_dir:       'Select one outbound (morning) and one return (afternoon/evening) flight.',
    ex_combine_title:           '⚡ Combined Express Trip',

    /* ── Logs ── */
    log_level_label:  'Level',
    log_opt_0:        '0 \u2014 Silent',
    log_opt_1:        '1 \u2014 Error',
    log_opt_2:        '2 \u2014 Info',
    log_opt_3:        '3 \u2014 Verbose',
    log_opt_4:        '4 \u2014 Debug',
    log_pause:        '⏸ Pause',
    log_resume:       '▶ Resume',
    log_clear:        '🗑 Clear',
    log_copy:         '📋 Copy',
    log_copied:       '✅ Copied',
    log_placeholder:  'Open this tab with the server running to see live logs.',

    /* ── Return flight ── */
    ts_title:        '✈ Selected trip',
    ts_outbound:     '✈ Outbound',
    ts_return_leg:   '↩ Return',
    ts_total:        'Estimated total',
    ts_save_both:    '♥ Save both flights',
    ts_saved_both:   '♥ Saved',
    ts_close:        'Close',
    rm_title:        '↩ Search return flight',
    rm_selected:     'Selected outbound:',
    rm_min_days:     'Minimum days of stay',
    rm_max_days:     'Maximum days of stay',
    rm_search:       '🔍 Search return',
    rm_from:         'From (return origin)',
    rm_to:           'To (return destination)',
    rm_no_airports:  'Select at least one origin and one destination airport.',
    rs_title:        (dst, ori) => `↩ Return \u2014 ${dst} \u2192 ${ori}`,
    rs_sub:          (dateLbl, stay) => `Based on outbound from ${dateLbl} · stay ${stay}`,
    rs_close:        '× Close',
    stay_days:       n => `${n} day${n !== 1 ? 's' : ''}`,
    stay_range:      (a, b) => `${a}\u2013${b} days`,
    conn_error:      'Could not connect to the backend.',
    conn_error_full: 'Could not connect to the server. Please try again in a few seconds.',
    import_invalid:  'The file is not a valid express JSON.',

    /* ── Date presets ── */
    date_presets_toggle:  '📅 Quick date selection',
    preset_this_weekend:  'This weekend',
    preset_next_weekend:  'Next weekend',
    preset_this_month:    'This month',
    preset_next_month:    'Next month',
    preset_next_2weeks:   'Next 2 weeks',
    preset_next_4weeks:   'Next 4 weeks',
    preset_next_2months:  'Next 2 months',
    preset_next_3months:  'Next 3 months',
    preset_single_month:  '📅 Full month',
    preset_full_month:    '📆 Month range',
    preset_full_month_ph: 'Choose month and year',
    preset_range_from:    'From',
    preset_range_to:      'To',

    /* ── Date/time ── */
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    months:   ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    locale_tag: 'en-GB',

    /* ── Airport filter checkbox ── */
    label_show_all_airports:         'Show all airports',
    tooltip_show_all_airports:       'By default only relevant airports are shown (importance 3–5). Enable this to also see small, regional and private airports.',

    /* ── Countries ── */
    country_AE: 'UAE',              country_AF: 'Afghanistan',    country_AG: 'Antigua & Barbuda',
    country_AI: 'Anguilla',         country_AL: 'Albania',        country_AM: 'Armenia',
    country_AO: 'Angola',           country_AQ: 'Antarctica',     country_AR: 'Argentina',
    country_AS: 'American Samoa',   country_AT: 'Austria',        country_AU: 'Australia',
    country_AW: 'Aruba',            country_AZ: 'Azerbaijan',     country_BA: 'Bosnia & Herzegovina',
    country_BB: 'Barbados',         country_BD: 'Bangladesh',     country_BE: 'Belgium',
    country_BF: 'Burkina Faso',     country_BG: 'Bulgaria',       country_BH: 'Bahrain',
    country_BI: 'Burundi',          country_BJ: 'Benin',          country_BL: 'St. Barthélemy',
    country_BM: 'Bermuda',          country_BN: 'Brunei',         country_BO: 'Bolivia',
    country_BQ: 'Caribbean Netherlands', country_BR: 'Brazil',    country_BS: 'Bahamas',
    country_BT: 'Bhutan',           country_BW: 'Botswana',       country_BY: 'Belarus',
    country_BZ: 'Belize',           country_CA: 'Canada',         country_CC: 'Cocos Islands',
    country_CD: 'Congo (DRC)',      country_CF: 'Central African Rep.', country_CG: 'Congo',
    country_CH: 'Switzerland',      country_CI: "Côte d'Ivoire",  country_CK: 'Cook Islands',
    country_CL: 'Chile',            country_CM: 'Cameroon',       country_CN: 'China',
    country_CO: 'Colombia',         country_CR: 'Costa Rica',     country_CU: 'Cuba',
    country_CV: 'Cape Verde',       country_CW: 'Curaçao',        country_CX: 'Christmas Island',
    country_CY: 'Cyprus',           country_CZ: 'Czech Republic', country_DE: 'Germany',
    country_DJ: 'Djibouti',         country_DK: 'Denmark',        country_DM: 'Dominica',
    country_DO: 'Dominican Rep.',   country_DZ: 'Algeria',        country_EC: 'Ecuador',
    country_EE: 'Estonia',          country_EG: 'Egypt',          country_EH: 'Western Sahara',
    country_ER: 'Eritrea',          country_ES: 'Spain',          country_ET: 'Ethiopia',
    country_FI: 'Finland',          country_FJ: 'Fiji',           country_FK: 'Falkland Islands',
    country_FM: 'Micronesia',       country_FO: 'Faroe Islands',  country_FR: 'France',
    country_GA: 'Gabon',            country_GB: 'United Kingdom', country_GD: 'Grenada',
    country_GE: 'Georgia',          country_GF: 'French Guiana',  country_GG: 'Guernsey',
    country_GH: 'Ghana',            country_GI: 'Gibraltar',      country_GL: 'Greenland',
    country_GM: 'Gambia',           country_GN: 'Guinea',         country_GP: 'Guadeloupe',
    country_GQ: 'Equatorial Guinea',country_GR: 'Greece',         country_GT: 'Guatemala',
    country_GU: 'Guam',             country_GW: 'Guinea-Bissau',  country_GY: 'Guyana',
    country_HK: 'Hong Kong',        country_HN: 'Honduras',       country_HR: 'Croatia',
    country_HT: 'Haiti',            country_HU: 'Hungary',        country_ID: 'Indonesia',
    country_IE: 'Ireland',          country_IL: 'Israel',         country_IM: 'Isle of Man',
    country_IN: 'India',            country_IQ: 'Iraq',           country_IR: 'Iran',
    country_IS: 'Iceland',          country_IT: 'Italy',          country_JE: 'Jersey',
    country_JM: 'Jamaica',          country_JO: 'Jordan',         country_JP: 'Japan',
    country_KE: 'Kenya',            country_KG: 'Kyrgyzstan',     country_KH: 'Cambodia',
    country_KI: 'Kiribati',         country_KM: 'Comoros',        country_KN: 'St. Kitts & Nevis',
    country_KP: 'North Korea',      country_KR: 'South Korea',    country_KW: 'Kuwait',
    country_KY: 'Cayman Islands',   country_KZ: 'Kazakhstan',     country_LA: 'Laos',
    country_LB: 'Lebanon',          country_LC: 'St. Lucia',      country_LK: 'Sri Lanka',
    country_LR: 'Liberia',          country_LS: 'Lesotho',        country_LT: 'Lithuania',
    country_LU: 'Luxembourg',       country_LV: 'Latvia',         country_LY: 'Libya',
    country_MA: 'Morocco',          country_MD: 'Moldova',        country_ME: 'Montenegro',
    country_MF: 'St. Martin (Fr)',  country_MG: 'Madagascar',     country_MH: 'Marshall Islands',
    country_MK: 'North Macedonia',  country_ML: 'Mali',           country_MM: 'Myanmar',
    country_MN: 'Mongolia',         country_MO: 'Macau',          country_MP: 'N. Mariana Islands',
    country_MQ: 'Martinique',       country_MR: 'Mauritania',     country_MS: 'Montserrat',
    country_MT: 'Malta',            country_MU: 'Mauritius',      country_MV: 'Maldives',
    country_MW: 'Malawi',           country_MX: 'Mexico',         country_MY: 'Malaysia',
    country_MZ: 'Mozambique',       country_NA: 'Namibia',        country_NC: 'New Caledonia',
    country_NE: 'Niger',            country_NF: 'Norfolk Island', country_NG: 'Nigeria',
    country_NI: 'Nicaragua',        country_NL: 'Netherlands',    country_NO: 'Norway',
    country_NP: 'Nepal',            country_NR: 'Nauru',          country_NU: 'Niue',
    country_NZ: 'New Zealand',      country_OM: 'Oman',           country_PA: 'Panama',
    country_PE: 'Peru',             country_PF: 'French Polynesia', country_PG: 'Papua New Guinea',
    country_PH: 'Philippines',      country_PK: 'Pakistan',       country_PL: 'Poland',
    country_PM: 'St. Pierre & Miquelon', country_PR: 'Puerto Rico', country_PT: 'Portugal',
    country_PW: 'Palau',            country_PY: 'Paraguay',       country_QA: 'Qatar',
    country_RE: 'Réunion',          country_RO: 'Romania',        country_RS: 'Serbia',
    country_RU: 'Russia',           country_RW: 'Rwanda',         country_SA: 'Saudi Arabia',
    country_SB: 'Solomon Islands',  country_SC: 'Seychelles',     country_SD: 'Sudan',
    country_SE: 'Sweden',           country_SG: 'Singapore',      country_SH: 'St. Helena',
    country_SI: 'Slovenia',         country_SK: 'Slovakia',       country_SL: 'Sierra Leone',
    country_SN: 'Senegal',          country_SO: 'Somalia',        country_SR: 'Suriname',
    country_SS: 'South Sudan',      country_ST: 'São Tomé & Príncipe', country_SV: 'El Salvador',
    country_SX: 'Sint Maarten',     country_SY: 'Syria',          country_SZ: 'Eswatini',
    country_TC: 'Turks & Caicos',   country_TD: 'Chad',           country_TG: 'Togo',
    country_TH: 'Thailand',         country_TJ: 'Tajikistan',     country_TL: 'Timor-Leste',
    country_TM: 'Turkmenistan',     country_TN: 'Tunisia',        country_TO: 'Tonga',
    country_TR: 'Turkey',           country_TT: 'Trinidad & Tobago', country_TV: 'Tuvalu',
    country_TW: 'Taiwan',           country_TZ: 'Tanzania',       country_UA: 'Ukraine',
    country_UG: 'Uganda',           country_UM: 'U.S. Minor Outlying Islands', country_US: 'United States',
    country_AK: 'Alaska',           country_UY: 'Uruguay',        country_UZ: 'Uzbekistan',
    country_VC: 'St. Vincent & Grenadines', country_VE: 'Venezuela', country_VG: 'British Virgin Islands',
    country_VN: 'Vietnam',          country_VU: 'Vanuatu',        country_WF: 'Wallis & Futuna',
    country_WS: 'Samoa',            country_XK: 'Kosovo',         country_YE: 'Yemen',
    country_YT: 'Mayotte',          country_ZA: 'South Africa',   country_ZM: 'Zambia',
    country_ZW: 'Zimbabwe',
  },
};

/* ── Core ── */
let currentLang = localStorage.getItem('lang') || 'es';

function t(key, ...args) {
  const locale = I18N[currentLang] || I18N.es;
  const val = key in locale ? locale[key] : (key in I18N.es ? I18N.es[key] : key);
  if (typeof val === 'function') return val(...args);
  return val;
}

/* ── DOM application ── */
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    // Don't overwrite placeholder on airport search inputs that already have selections
    // (they deliberately set placeholder='' via updateTriggerText)
    if (el.classList.contains('dropdown-search-input')) {
      const tokens = el.closest('.airport-trigger')?.querySelector('.airport-trigger-tokens');
      if (tokens && tokens.children.length > 0) return;
    }
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.setAttribute('title', t(el.dataset.i18nTitle));
  });
  document.querySelectorAll('[data-i18n-day]').forEach(el => {
    el.textContent = t('weekdays')[parseInt(el.dataset.i18nDay)];
  });
  document.documentElement.lang = currentLang;
  const langLabel = document.getElementById('langLabel');
  if (langLabel) langLabel.textContent = currentLang === 'es' ? 'EN' : 'ES';
  const langToggle = document.getElementById('langToggle');
  if (langToggle) {
    langToggle.setAttribute('aria-label',
      currentLang === 'es' ? 'Switch to English' : 'Cambiar a Español');
  }
}

/* ── Language change hooks ── */
const _langCallbacks = [];
function onLangChange(fn) { _langCallbacks.push(fn); }

function setLang(lang) {
  if (lang !== 'es' && lang !== 'en') return;
  currentLang = lang;
  localStorage.setItem('lang', lang);
  applyI18n();
  _langCallbacks.forEach(fn => fn());
}

/* ── Initialise ── */
// Scripts run after DOM is built (end of body), so we can act immediately.
applyI18n();
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('langToggle')?.addEventListener('click', () => {
    setLang(currentLang === 'es' ? 'en' : 'es');
  });
});
