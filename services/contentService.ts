import type { Language } from './translations';

/** Data URI из assets/library-fallbacks/ (скрипт generate-library-fallback-uris.js). Только фото с устройства. */
import { LIBRARY_FALLBACK_DATA_URIS } from './libraryFallbackDataUris.generated';

const hashCategory = (s: string): number => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
    return Math.abs(h);
};

/** Data URI считается битым, если внутри base64 декодируется в HTML (например 404 от Wikimedia). */
function isValidImageDataUri(uri: string): boolean {
    if (!uri || !uri.startsWith('data:image')) return false;
    try {
        const b64 = uri.split(',')[1];
        if (!b64) return false;
        const decoded = atob(b64.slice(0, 200));
        return !decoded.includes('<!DOCTYPE') && !decoded.includes('Wikipedia Error');
    } catch {
        return true;
    }
}

/** Фолбэк-фото только с устройства. Если по индексу битый data URI — подставляем следующее валидное из пула. */
export function getLibraryFallbackImage(category: string | undefined): string {
    const n = LIBRARY_FALLBACK_DATA_URIS.length;
    if (!n) return '';
    const start = category ? hashCategory(category) % n : 0;
    for (let i = 0; i < n; i++) {
        const idx = (start + i) % n;
        const uri = LIBRARY_FALLBACK_DATA_URIS[idx];
        if (uri && isValidImageDataUri(uri)) return uri;
    }
    return LIBRARY_FALLBACK_DATA_URIS[0] ?? '';
}

/** Первое валидное фолбэк-фото с устройства. */
export function getFirstLibraryFallbackImage(): string {
    for (const uri of LIBRARY_FALLBACK_DATA_URIS) {
        if (uri && isValidImageDataUri(uri)) return uri;
    }
    return LIBRARY_FALLBACK_DATA_URIS[0] ?? '';
}

/** Пустой массив: префетч URL не используется, только локальные фото. */
export function getLibraryFallbackUrls(): string[] {
    return [];
}

export const GARDENER_TIPS = [
    { 
        id: "tip-1",
        title: "Искусство полива: Физика и химия гидратации", 
        category: "Гидратация",
        text: "### 1. Физиология водного обмена\nВода для растения — это не просто средство утоления жажды, а ключевая транспортная среда для минеральных веществ. При поливе важно понимать структуру корневой системы. Для большинства видов критически важно избегать «эффекта болота»: корни должны дышать. Полив должен осуществляться методом полного промачивания земляного кома до появления воды в поддоне, которую затем необходимо слить через 15-20 минут. Это обеспечивает удаление накопившихся солей и доставку влаги к самым нижним корням.\n\n### 2. Температурный режим и качество воды\nИспользуйте исключительно мягкую, отстоянную воду комнатной температуры (на 2-3 градуса выше температуры воздуха). Холодная вода вызывает осмотический шок, блокируя всасывающую способность корневых волосков, что парадоксальным образом приводит к увяданию даже во влажном грунте. Жесткая вода со временем защелачивает почву (хлороз), поэтому рекомендуется периодически добавлять несколько капель лимонного сока на литр воды для нейтрализации карбонатов.\n\n### 3. Диагностика потребности во влаге\nОткажитесь от полива «по расписанию» (например, каждую субботу). Потребность растения меняется в зависимости от освещения и температуры. Используйте правило фаланги: погрузите палец в грунт на 2-3 см. Если почва сухая — пора поливать. Для крупных кашпо используйте деревянную шпажку, опуская ее до дна: если она влажная и с прилипшей землей, полив категорически противопоказан, чтобы избежать анаэробного загнивания.\n\n### 4. Сезонная коррекция\nВ осенне-зимний период метаболизм растений замедляется из-за сокращения светового дня. В это время частоту полива следует сократить в 2-3 раза, допуская более глубокую просушку субстрата. Самая частая причина гибели зимой — сочетание мокрого грунта и холодного подоконника («холодные ноги»), что ведет к фузариозу и корневой гнили. Летом же, в период активной вегетации и жары, транспирация (испарение с листьев) максимальна, и некоторым видам может требоваться ежедневный полив.\n\n### 5. Профессиональный лайфхак: Тургор и аэрация\nСледите за тургором (упругостью) листьев. Легкая потеря тургора — самый надежный сигнал к поливу. После каждого третьего полива рекомендуется аккуратно рыхлить верхний слой почвы для разрушения солевой корки и улучшения газообмена. Помните: растение легче восстановить после легкой засухи, чем спасти от залива.", 
        icon: 'water', 
        color: '#60a5fa',
        bg: 'rgba(96, 165, 250, 0.15)',
        image: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Pilea_peperomioides_Chinese_money_plant.jpg/400px-Pilea_peperomioides_Chinese_money_plant.jpg"
    },
    { 
        id: "tip-2",
        title: "Световой режим: Фотосинтез и спектры", 
        category: "Освещение",
        text: "### 1. Фотосинтез как основа жизни\nСвет является единственным источником энергии для растения. Интенсивность освещения падает пропорционально квадрату расстояния от окна: растение в 1 метре от стекла получает лишь 25% от того света, что есть на подоконнике. Для большинства видов критически важно обеспечить стабильный световой поток, так как частые перестановки заставляют растение тратить ресурсы на переориентацию листовых пластин (гелиотропизм), что замедляет общий рост.\n\n### 2. Спектральный состав и качество\nРастению необходим полный спектр. Синий спектр отвечает за вегетативный рост и плотность листвы, красный — за цветение и развитие корневой системы. Оконное стекло фильтрует большую часть полезного ультрафиолета. Избегайте прямых полуденных лучей, которые могут вызвать фотоокисление хлорофилла (ожоги), проявляющиеся как белесые или коричневые пятна. Идеальный вариант — яркий, но рассеянный свет через тюль или жалюзи.\n\n### 3. Признаки светового дисбаланса\nПри дефиците света растение начинает вытягиваться (этиоляция), междоузлия удлиняются, а новые листья мельчают и теряют сортовую окраску (вариегатность). При избытке света листья могут становиться бледными, желтоватыми или приобретать красноватый оттенок (выработка антоцианов как защита). Регулярно осматривайте растение, чтобы вовремя заметить эти сигналы и скорректировать местоположение.\n\n### 4. Зимний режим и досветка\nВ наших широтах зимой световой день сокращается до 7-8 часов, что является стрессом для тропических видов. В этот период жизненно важно либо понизить температуру содержания для введения в покой, либо использовать искусственную досветку (фитолампы полного спектра или холодного белого света 6500K) для продления дня до 12-14 часов. Это предотвратит зимний листопад и истощение.\n\n### 5. Гигиена и эффективность\nПыль на листьях работает как светофильтр, блокируя до 20% полезного излучения. Регулярно протирайте листья влажной тканью или устраивайте теплый душ. Это не только улучшает внешний вид, но и значительно повышает эффективность фотосинтеза, позволяя растению вырабатывать больше энергии для роста и иммунной защиты даже в условиях недостаточной освещенности.", 
        icon: 'sunny', 
        color: '#facc15',
        bg: 'rgba(250, 204, 21, 0.15)',
        image: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Lavandula-angustifolia.jpg/400px-Lavandula-angustifolia.jpg"
    },
    { 
        id: "tip-3",
        title: "Архитектура почвы: Больше чем просто земля", 
        category: "Субстраты",
        text: "### 1. Структура и аэрация\nИдеальный субстрат должен выполнять две функции: удерживать влагу и обеспечивать доступ кислорода к корням. Плотный, тяжелый грунт ведет к гипоксии и отмиранию корней. Рекомендуется использовать смесь на основе верхового торфа с добавлением 30-40% разрыхлителей: перлита, вермикулита или цеолита. Такая структура предотвращает слеживание и обеспечивает быстрое просыхание после полива.\n\n### 2. Кислотность (pH) среды\nУровень pH почвы определяет доступность питательных веществ. Для большинства комнатных растений оптимален слабокислый грунт (pH 5.5-6.5). При защелачивании (часто происходит от жесткой воды) корни перестают усваивать железо, что ведет к хлорозу. Раз в год рекомендуется проверять кислотность или проводить профилактическую пересадку в свежий субстрат для восстановления химического баланса.\n\n### 3. Биология почвы\nПочва — это живая среда. В природе корни живут в симбиозе с микроорганизмами. При посадке полезно добавлять в грунт споры микоризы или препараты сенной палочки. Это подавляет развитие патогенных грибков (корневых гнилей) и улучшает всасывающую способность корней. Избегайте «стерильных» условий; здоровая микрофлора — залог иммунитета.\n\n### 4. Дренажная система\nМиф о том, что керамзит на дне спасает от залива, опасен. На самом деле он просто поднимает уровень влажного грунта выше. Гораздо важнее наличие дренажных отверстий в горшке и рыхлость самого субстрата по всему объему. Если вы используете кашпо без отверстий, практикуйте «двойной горшок»: посадите растение в технический пластиковый горшок и поставьте его внутрь декоративного.\n\n### 5. Истощение и пересадка\nЛюбой, даже самый качественный грунт, истощается за 6-8 месяцев активного роста. Структура разрушается, накапливаются соли. Если вы заметили, что вода стала слишком долго стоять на поверхности или, наоборот, мгновенно вытекать, не смачивая ком — пора пересаживать. Не бойтесь полной замены грунта, если старый субстрат имеет неприятный запах или признаки плесени.", 
        icon: 'star', 
        color: '#34d399',
        bg: 'rgba(52, 211, 153, 0.15)',
        image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Aloe_vera_002.jpg/400px-Aloe_vera_002.jpg"
    },
    { 
        id: "tip-4",
        title: "Влажность воздуха: VPD и микроклимат", 
        category: "Климат",
        text: "### 1. Понятие дефицита влажности (VPD)\nВлажность воздуха важна не сама по себе, а в связке с температурой. Этот параметр называется VPD (дефицит упругости водяного пара). Чем выше температура и ниже влажность, тем сильнее воздух «высасывает» воду из листьев. Зимой в квартирах с отоплением влажность падает до 20%, а температура держится около 25°C. Это экстремальные условия пустыни.\n\n### 2. Мифы об опрыскивании\nОпрыскивание из пульверизатора — самый стойкий и бесполезный миф. Оно повышает влажность вокруг листа ровно на 15 минут, пока капли не высохнут. Более того, вода на листьях может стать причиной грибковых заболеваний или сработать как линза, вызвав ожог на солнце. Опрыскивание полезно для смывания пыли, но как метод увлажнения оно неэффективно.\n\n### 3. Эффективное увлажнение\nРеальные способы повысить влажность: увлажнитель воздуха (ультразвуковой или паровой). Это единственное решение, дающее стабильные 50-60%. Если увлажнителя нет, используйте «метод группировки». Растения, стоящие плотной группой, создают общий микроклимат, задерживая испаряемую влагу под пологом листьев.\n\n### 4. Вентиляция и застой\nОпасность высокой влажности — застой воздуха. В природе ветер постоянно обновляет воздушные массы. В квартире высокая влажность (более 70%) без циркуляции воздуха — идеальная среда для плесени и серой гнили. Если вы используете увлажнитель, обеспечьте движение воздуха (микропроветривание), чтобы вода не конденсировалась на листьях надолго.\n\n### 5. Зональность и адаптация\nЛокальные зоны комфорта — ванная комната с окном или кухня. Избегайте ставить растения рядом с радиаторами отопления и под струей кондиционера. Потоки сухого горячего или ледяного воздуха разрушают защитную кутикулу листа, вызывая обезвоживание тканей, которое невозможно вылечить поливом.", 
        icon: 'partly-sunny', 
        color: '#22d3ee',
        bg: 'rgba(34, 211, 238, 0.15)',
        image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Convallaria_majalis_flower_2.jpg/400px-Convallaria_majalis_flower_2.jpg"
    },
    { 
        id: "tip-5",
        title: "Философия обрезки: Гормоны и форма", 
        category: "Уход",
        text: "### 1. Гормональный баланс\nОбрезка — это управление гормональной системой растения. На верхушке побега вырабатываются ауксины — гормоны, подавляющие рост боковых почек (апикальное доминирование). Отрезая макушку, мы убираем источник ауксинов, и растение вынуждено пробуждать спящие почки ниже среза, начиная ветвиться и становиться пышнее.\n\n### 2. Санитарные нормы\nСанитарная обрезка обязательна и не терпит жалости. Желтые, больные, сухие листья — это балласт и ворота для инфекций. Удаляйте увядшие цветы сразу же: созревание семян — самый энергозатратный процесс. Убрав цветок, вы перенаправляете энергию на рост корней и новых листьев.\n\n### 3. Техника безопасности\nРезать нужно острым, стерильным инструментом (секатор, лезвие), обработанным спиртом. Рваные раны от тупых ножниц заживают долго и часто загнивают. Срез делается на 3–5 мм выше спящей почки (узла), под углом, чтобы вода стекала, а не застаивалась на срезе.\n\n### 4. Омоложение корней\nКорневая обрезка — секрет долголетия кадочных растений. Если растение переросло свой горшок, но увеличивать объем некуда, можно провести омоложение. Выньте растение, обрежьте нижнюю треть корневого кома и удалите часть старого грунта. Это стимулирует рост молодых всасывающих корешков.\n\n### 5. Токсичность соков\nСок многих комнатных растений токсичен (диффенбахия, монстера, молочай). При обрезке всегда надевайте перчатки и не касайтесь лица. Если сок попал в глаза или на слизистую — промойте большим количеством воды. Держите свежеобрезанные растения подальше от детей и животных.", 
        icon: 'cut', 
        color: '#fb923c',
        bg: 'rgba(251, 146, 60, 0.15)',
        image: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Digitalis_purpurea_004.JPG/400px-Digitalis_purpurea_004.JPG"
    },
    { 
        id: "tip-6",
        title: "Карантинный протокол: Биобезопасность", 
        category: "Защита",
        text: "### 1. Правило изоляции\nЛюбое новое растение — это потенциальный «Троянский конь». Даже если в магазине оно выглядит идеально, в пазухах листьев могут прятаться вредители. Введение новичка в коллекцию без карантина — это риск заразить весь сад. Карантин — это не паранойя, а профессиональный стандарт.\n\n### 2. Сроки и условия\nСрок карантина должен составлять минимум 21 день. Это связано с жизненным циклом вредителей (например, паутинного клеща). Вы должны выждать время, чтобы скрытые проблемы проявились. Карантинная зона должна быть изолирована — отдельная комната или расстояние 2–3 метра от других цветов.\n\n### 3. Первичная обработка\nСразу после покупки устройте растению теплый душ (35-40°C), предварительно закрыв землю пакетом. Это механически смоет пыль и до 70% взрослых вредителей. Многие опытные цветоводы проводят профилактическую обработку инсектоакарицидом сразу, не дожидаясь симптомов.\n\n### 4. Замена грунта\nМагазинный грунт часто является «транспортировочным» — он пустой и часто заражен. Если растение не цветет, лучшая практика — пересадить его в свой проверенный субстрат, максимально удалив магазинный грунт. Это также позволит оценить состояние корней.\n\n### 5. Управление резистентностью\nВредители быстро привыкают к ядам. Если вы нашли вредителя и обработали растение, через 5–7 дней обработку нужно повторить, желательно препаратом с другим действующим веществом. Однократная обработка убивает взрослых, но из яиц вылупляется новое поколение.", 
        icon: 'shield-checkmark', 
        color: '#f87171',
        bg: 'rgba(248, 113, 113, 0.15)',
        image: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Sansevieria_trifasciata_001.jpg/400px-Sansevieria_trifasciata_001.jpg"
    }
];

/** English versions of gardener tips (same ids and images, translated title/category/text). */
const GARDENER_TIPS_EN = [
    { id: "tip-1", title: "The art of watering: Physics and chemistry of hydration", category: "Hydration", text: "### 1. Physiology of water exchange\nWater for plants is not just for thirst but the key transport medium for minerals. When watering, understand root structure. For most species avoid \"swamp effect\": roots need to breathe. Water by fully soaking the root ball until water appears in the tray, then drain after 15–20 minutes. This flushes salts and delivers moisture to the lowest roots.\n\n### 2. Temperature and water quality\nUse only soft, room-temperature water (2–3°C above air). Cold water causes osmotic shock and blocks root uptake, leading to wilt even in wet soil. Hard water alkalizes soil over time (chlorosis); add a few drops of lemon per liter to neutralize carbonates.\n\n### 3. Reading the need for moisture\nAvoid watering \"on schedule.\" Use the finger test: insert 2–3 cm into the soil. If dry, water. For large pots use a wooden skewer; if it comes out damp with soil, do not water to avoid anaerobic rot.\n\n### 4. Seasonal adjustment\nIn fall and winter, metabolism slows. Reduce watering frequency 2–3× and allow deeper drying. The common cause of winter loss is wet soil plus cold sill (\"cold feet\") leading to fusarium and root rot. In summer, daily watering may be needed.\n\n### 5. Turgor and aeration\nWatch leaf turgor; slight loss is the best signal to water. After every third watering, gently loosen the top layer to break salt crust and improve gas exchange. Plants recover more easily from slight drought than from overwatering.", icon: 'water' as const, color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)', image: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Pilea_peperomioides_Chinese_money_plant.jpg/400px-Pilea_peperomioides_Chinese_money_plant.jpg" },
    { id: "tip-2", title: "Light regime: Photosynthesis and spectra", category: "Lighting", text: "### 1. Photosynthesis as the basis of life\nLight is the only energy source. Intensity falls with the square of distance from the window: 1 m from the glass gives about 25% of sill light. Avoid frequent moves; plants spend resources reorienting leaves (heliotropism).\n\n### 2. Spectral quality\nPlants need full spectrum. Blue drives vegetative growth, red drives flowering and roots. Window glass filters much UV. Avoid midday direct sun (photo-oxidation, burns). Ideal: bright but diffused light.\n\n### 3. Signs of imbalance\nLow light causes etiolation (stretching), small leaves, loss of variegation. Too much light: pale, yellow, or reddish leaves (anthocyanins). Inspect regularly and adjust position.\n\n### 4. Winter and supplemental light\nShort winter days stress tropicals. Either lower temperature for dormancy or use full-spectrum or 6500K grow lights to extend day to 12–14 hours.\n\n### 5. Leaf hygiene\nDust blocks up to 20% of light. Wipe leaves or give a warm shower to improve photosynthesis and appearance.", icon: 'sunny' as const, color: '#facc15', bg: 'rgba(250, 204, 21, 0.15)', image: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Lavandula-angustifolia.jpg/400px-Lavandula-angustifolia.jpg" },
    { id: "tip-3", title: "Soil architecture: More than just dirt", category: "Substrates", text: "### 1. Structure and aeration\nIdeal substrate holds moisture and allows oxygen to roots. Dense soil causes hypoxia. Use peat-based mix with 30–40% perlite, vermiculite, or zeolite for fast drainage.\n\n### 2. pH\nMost houseplants prefer slightly acidic (pH 5.5–6.5). Alkaline soil from hard water blocks iron (chlorosis). Check pH yearly or repot into fresh mix.\n\n### 3. Soil biology\nSoil is alive. Add mycorrhizal spores or Bacillus subtilis when planting to suppress root rot and improve uptake. Healthy microflora supports immunity.\n\n### 4. Drainage\nDrainage holes and loose substrate matter more than a layer of pebbles. For pots without holes, use a plastic inner pot inside a decorative one.\n\n### 5. Depletion and repotting\nEven good soil depletes in 6–8 months. If water sits on top or runs through without wetting, repot. Replace soil fully if there is odor or mold.", icon: 'star' as const, color: '#34d399', bg: 'rgba(52, 211, 153, 0.15)', image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Aloe_vera_002.jpg/400px-Aloe_vera_002.jpg" },
    { id: "tip-4", title: "Air humidity: VPD and microclimate", category: "Climate", text: "### 1. VPD (vapor pressure deficit)\nHumidity matters together with temperature. High temp and low humidity make air \"pull\" water from leaves. Winter heating can drop humidity to 20% at 25°C — desert-like.\n\n### 2. Mist myths\nMisting raises humidity for about 15 minutes and can promote fungus or act as a lens for sunburn. Use it for cleaning leaves, not for humidity.\n\n### 3. Effective humidification\nUse a humidifier for stable 50–60%. Without one, group plants to create a shared microclimate under the canopy.\n\n### 4. Ventilation\nHigh humidity without air movement encourages mold. Provide gentle airflow when using a humidifier.\n\n### 5. Placement\nBathrooms and kitchens are often more humid. Avoid radiators and AC drafts; they damage leaf cuticle and cause dehydration.", icon: 'partly-sunny' as const, color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.15)', image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Convallaria_majalis_flower_2.jpg/400px-Convallaria_majalis_flower_2.jpg" },
    { id: "tip-5", title: "Pruning: Hormones and shape", category: "Care", text: "### 1. Hormonal balance\nPruning shapes the plant via auxins. Removing the tip (apical dominance) wakes lateral buds and promotes branching.\n\n### 2. Sanitary pruning\nRemove yellow, diseased, and dry leaves; they invite infection. Deadhead flowers to redirect energy to roots and new growth.\n\n### 3. Technique\nUse sharp, sterilized tools. Cut 3–5 mm above a node at an angle so water runs off.\n\n### 4. Root rejuvenation\nFor overgrown plants, trim the lower third of the root ball and replace some soil to stimulate new roots.\n\n### 5. Toxicity\nMany houseplant saps are toxic. Wear gloves when pruning; keep cuttings away from children and pets.", icon: 'cut' as const, color: '#fb923c', bg: 'rgba(251, 146, 60, 0.15)', image: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Digitalis_purpurea_004.JPG/400px-Digitalis_purpurea_004.JPG" },
    { id: "tip-6", title: "Quarantine protocol: Biosecurity", category: "Protection", text: "### 1. Isolation rule\nEvery new plant can carry pests. Quarantine is a professional standard, not paranoia.\n\n### 2. Duration and conditions\nQuarantine at least 21 days (covers pest life cycles). Keep the plant in a separate room or 2–3 m from others.\n\n### 3. First treatment\nAfter purchase, give a warm shower (35–40°C) with soil covered to wash off dust and many pests. Some growers treat preventively with insecticide-acaricide.\n\n### 4. Replace potting mix\nNursery soil is often \"transport\" mix and can be contaminated. Repot into your own mix when possible and check roots.\n\n### 5. Resistance management\nRepeat treatment in 5–7 days with a different active ingredient; one application kills adults but not eggs.", icon: 'shield-checkmark' as const, color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)', image: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Sansevieria_trifasciata_001.jpg/400px-Sansevieria_trifasciata_001.jpg" }
];

/** Returns gardener tips in the requested language. */
export function getGardenerTips(language: Language) {
    if (language === 'ru') return GARDENER_TIPS;
    return GARDENER_TIPS_EN;
}

/** Returns 3 articles that change every 24 hours; language determines content. */
export function getDailyTips(language: Language = 'ru') {
    const tips = getGardenerTips(language);
    const today = new Date();
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24);
    const totalTips = tips.length;
    const startIndex = dayOfYear % totalTips;
    const dailySelection = [];
    for (let i = 0; i < 3; i++) {
        const index = (startIndex + i) % totalTips;
        dailySelection.push(tips[index]);
    }
    return dailySelection;
}
