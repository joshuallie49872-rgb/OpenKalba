import json
import shutil
import datetime
from pathlib import Path

UI_PATH = Path("i18n/ui.json")
BACKUP = UI_PATH.with_suffix(UI_PATH.suffix + ".bak_" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S"))

if not UI_PATH.exists():
    raise SystemExit(f"Missing: {UI_PATH}")

shutil.copy2(UI_PATH, BACKUP)
u = json.load(open(UI_PATH, encoding="utf-8"))

# Native UI languages supported (what your app UI can be in)
# Start from whatever is already in ui.json + ensure new 4 exist.
native_langs = list(u.keys())
for code in ["pt", "hi", "bn", "ur"]:
    if code not in u or not isinstance(u.get(code), dict):
        u[code] = {}
        native_langs.append(code)

# English schema (so new languages get all existing keys)
en = u.get("en", {})
if not isinstance(en, dict) or not en:
    raise SystemExit("i18n/ui.json missing or empty 'en' block")

# Token translations used in the pill (and elsewhere)
BASICS = {
    "en": "Basics",
    "lt": "Pagrindai",
    "mx": "Fundamentos",
    "pl": "Podstawy",
    "ru": "Основы",
    "et": "Põhitõed",
    "lv": "Pamati",
    "uk": "Основи",
    "is": "Grunnatriði",
    "fr": "Bases",
    "fi": "Perusteet",
    "se": "Grunder",
    "no": "Grunnleggende",
    "de": "Grundlagen",
    "so": "Aasaaska",
    "ga": "Bunús",
    "cy": "Hanfodion",
    "zh": "基础",
    "pt": "Noções básicas",
    "hi": "मूल बातें",
    "bn": "মৌলিক বিষয়",
    "ur": "بنیادی باتیں",
}

# Localized language names (course names) per native UI language
# Keys we will write: lang_<coursecode>
LANG_NAMES = {
    "en": {
        "lt": "Lithuanian","en":"English","mx":"Spanish","pl":"Polish","ru":"Russian","et":"Estonian","lv":"Latvian","uk":"Ukrainian","is":"Icelandic",
        "fr":"French","fi":"Finnish","se":"Swedish","no":"Norwegian","de":"German","so":"Somali","ga":"Irish","cy":"Welsh","zh":"Chinese",
        "pt":"Portuguese","hi":"Hindi","bn":"Bengali","ur":"Urdu",
    },
    "de": {
        "lt": "Litauisch","en":"Englisch","mx":"Spanisch","pl":"Polnisch","ru":"Russisch","et":"Estnisch","lv":"Lettisch","uk":"Ukrainisch","is":"Isländisch",
        "fr":"Französisch","fi":"Finnisch","se":"Schwedisch","no":"Norwegisch","de":"Deutsch","so":"Somali","ga":"Irisch","cy":"Walisisch","zh":"Chinesisch",
        "pt":"Portugiesisch","hi":"Hindi","bn":"Bengalisch","ur":"Urdu",
    },
    "mx": {
        "lt": "Lituano","en":"Inglés","mx":"Español","pl":"Polaco","ru":"Ruso","et":"Estonio","lv":"Letón","uk":"Ucraniano","is":"Islandés",
        "fr":"Francés","fi":"Finés","se":"Sueco","no":"Noruego","de":"Alemán","so":"Somalí","ga":"Irlandés","cy":"Galés","zh":"Chino",
        "pt":"Portugués","hi":"Hindi","bn":"Bengalí","ur":"Urdu",
    },
    "fr": {
        "lt": "Lituanien","en":"Anglais","mx":"Espagnol","pl":"Polonais","ru":"Russe","et":"Estonien","lv":"Letton","uk":"Ukrainien","is":"Islandais",
        "fr":"Français","fi":"Finnois","se":"Suédois","no":"Norvégien","de":"Allemand","so":"Somali","ga":"Irlandais","cy":"Gallois","zh":"Chinois",
        "pt":"Portugais","hi":"Hindi","bn":"Bengali","ur":"Ourdou",
    },
    "lt": {
        "lt":"Lietuvių","en":"Anglų","mx":"Ispanų","pl":"Lenkų","ru":"Rusų","et":"Estų","lv":"Latvių","uk":"Ukrainiečių","is":"Islandų",
        "fr":"Prancūzų","fi":"Suomių","se":"Švedų","no":"Norvegų","de":"Vokiečių","so":"Somalių","ga":"Airių","cy":"Valų","zh":"Kinų",
        "pt":"Portugalų","hi":"Hindi","bn":"Bengalų","ur":"Urdu",
    },
    "ru": {
        "lt":"Литовский","en":"Английский","mx":"Испанский","pl":"Польский","ru":"Русский","et":"Эстонский","lv":"Латышский","uk":"Украинский","is":"Исландский",
        "fr":"Французский","fi":"Финский","se":"Шведский","no":"Норвежский","de":"Немецкий","so":"Сомалийский","ga":"Ирландский","cy":"Валлийский","zh":"Китайский",
        "pt":"Португальский","hi":"Хинди","bn":"Бенгальский","ur":"Урду",
    },
    "pl": {
        "lt":"Litewski","en":"Angielski","mx":"Hiszpański","pl":"Polski","ru":"Rosyjski","et":"Estoński","lv":"Łotewski","uk":"Ukraiński","is":"Islandzki",
        "fr":"Francuski","fi":"Fiński","se":"Szwedzki","no":"Norweski","de":"Niemiecki","so":"Somalijski","ga":"Irlandzki","cy":"Walijski","zh":"Chiński",
        "pt":"Portugalski","hi":"Hindi","bn":"Bengalski","ur":"Urdu",
    },
    "zh": {
        "lt":"立陶宛语","en":"英语","mx":"西班牙语","pl":"波兰语","ru":"俄语","et":"爱沙尼亚语","lv":"拉脱维亚语","uk":"乌克兰语","is":"冰岛语",
        "fr":"法语","fi":"芬兰语","se":"瑞典语","no":"挪威语","de":"德语","so":"索马里语","ga":"爱尔兰语","cy":"威尔士语","zh":"中文",
        "pt":"葡萄牙语","hi":"印地语","bn":"孟加拉语","ur":"乌尔都语",
    },
    "uk": {
        "lt":"Литовська","en":"Англійська","mx":"Іспанська","pl":"Польська","ru":"Російська","et":"Естонська","lv":"Латвійська","uk":"Українська","is":"Ісландська",
        "fr":"Французька","fi":"Фінська","se":"Шведська","no":"Норвезька","de":"Німецька","so":"Сомалійська","ga":"Ірландська","cy":"Валлійська","zh":"Китайська",
        "pt":"Португальська","hi":"Гінді","bn":"Бенгальська","ur":"Урду",
    },
    "et": {
        "lt":"Leedu","en":"Inglise","mx":"Hispaania","pl":"Poola","ru":"Vene","et":"Eesti","lv":"Läti","uk":"Ukraina","is":"Islandi",
        "fr":"Prantsuse","fi":"Soome","se":"Rootsi","no":"Norra","de":"Saksa","so":"Somaali","ga":"Iiri","cy":"Kõmri","zh":"Hiina",
        "pt":"Portugali","hi":"Hindi","bn":"Bengali","ur":"Urdu",
    },
    "lv": {
        "lt":"Lietuviešu","en":"Angļu","mx":"Spāņu","pl":"Poļu","ru":"Krievu","et":"Igauņu","lv":"Latviešu","uk":"Ukraiņu","is":"Islandiešu",
        "fr":"Franču","fi":"Somu","se":"Zviedru","no":"Norvēģu","de":"Vācu","so":"Somāļu","ga":"Īru","cy":"Velsiešu","zh":"Ķīniešu",
        "pt":"Portugāļu","hi":"Hindi","bn":"Bengāļu","ur":"Urdu",
    },
    "fi": {
        "lt":"Liettua","en":"Englanti","mx":"Espanja","pl":"Puola","ru":"Venäjä","et":"Viro","lv":"Latvia","uk":"Ukraina","is":"Islanti",
        "fr":"Ranska","fi":"Suomi","se":"Ruotsi","no":"Norja","de":"Saksa","so":"Somali","ga":"Irlanti","cy":"Kymri","zh":"Kiina",
        "pt":"Portugali","hi":"Hindi","bn":"Bengali","ur":"Urdu",
    },
    "se": {
        "lt":"Litauiska","en":"Engelska","mx":"Spanska","pl":"Polska","ru":"Ryska","et":"Estniska","lv":"Lettiska","uk":"Ukrainska","is":"Isländska",
        "fr":"Franska","fi":"Finska","se":"Svenska","no":"Norska","de":"Tyska","so":"Somaliska","ga":"Irländska","cy":"Walesiska","zh":"Kinesiska",
        "pt":"Portugisiska","hi":"Hindi","bn":"Bengaliska","ur":"Urdu",
    },
    "no": {
        "lt":"Litauisk","en":"Engelsk","mx":"Spansk","pl":"Polsk","ru":"Russisk","et":"Estisk","lv":"Latvisk","uk":"Ukrainsk","is":"Islandsk",
        "fr":"Fransk","fi":"Finsk","se":"Svensk","no":"Norsk","de":"Tysk","so":"Somali","ga":"Irsk","cy":"Walisisk","zh":"Kinesisk",
        "pt":"Portugisisk","hi":"Hindi","bn":"Bengali","ur":"Urdu",
    },
    "is": {
        "lt":"Litháíska","en":"Enska","mx":"Spænska","pl":"Pólska","ru":"Rússneska","et":"Eistneska","lv":"Lettneska","uk":"Úkraínska","is":"Íslenska",
        "fr":"Franska","fi":"Finnska","se":"Sænska","no":"Norska","de":"Þýska","so":"Sómalska","ga":"Írska","cy":"Velska","zh":"Kínverska",
        "pt":"Portúgalska","hi":"Hindí","bn":"Bengalska","ur":"Úrdú",
    },
    "so": {
        "lt":"Lithuweyniyaan","en":"Ingiriisi","mx":"Isbaanish","pl":"Boolish","ru":"Ruush","et":"Istooniyaan","lv":"Latfiyaan","uk":"Yukreeniyaan","is":"Iislandays",
        "fr":"Faransiis","fi":"Finnish","se":"Iswiidhish","no":"Noorwiijiyaan","de":"Jarmal","so":"Soomaali","ga":"Ayrish","cy":"Welsh","zh":"Shiine",
        "pt":"Boortaqiis","hi":"Hindi","bn":"Bangaali","ur":"Urdu",
    },
    "ga": {
        "lt":"Liotuáinis","en":"Béarla","mx":"Spáinnis","pl":"Polainnis","ru":"Rúisis","et":"Eastóinis","lv":"Laitvis","uk":"Úcráinis","is":"Íoslainnis",
        "fr":"Fraincis","fi":"Fionlainnis","se":"Sualainnis","no":"Ioruais","de":"Gearmáinis","so":"Somáilis","ga":"Gaeilge","cy":"Breatnais","zh":"Sínis",
        "pt":"Portaingéilis","hi":"Hiondúis","bn":"Beangáilis","ur":"Urdais",
    },
    "cy": {
        "lt":"Lithwaneg","en":"Saesneg","mx":"Sbaeneg","pl":"Pwyleg","ru":"Rwsieg","et":"Estoneg","lv":"Latfieg","uk":"Wcreineg","is":"Islandeg",
        "fr":"Ffrangeg","fi":"Ffinneg","se":"Swedeg","no":"Norwyeg","de":"Almaeneg","so":"Somaleg","ga":"Gwyddeleg","cy":"Cymraeg","zh":"Tsieineeg",
        "pt":"Portiwgaleg","hi":"Hindi","bn":"Bengaleg","ur":"Wrdw",
    },
    # New native UI languages (basic coverage)
    "pt": {
        "lt":"Lituano","en":"Inglês","mx":"Espanhol","pl":"Polonês","ru":"Russo","et":"Estoniano","lv":"Letão","uk":"Ucraniano","is":"Islandês",
        "fr":"Francês","fi":"Finlandês","se":"Sueco","no":"Norueguês","de":"Alemão","so":"Somali","ga":"Irlandês","cy":"Galês","zh":"Chinês",
        "pt":"Português","hi":"Hindi","bn":"Bengali","ur":"Urdu",
    },
    "hi": {
        "lt":"लिथुआनियाई","en":"अंग्रेज़ी","mx":"स्पेनिश","pl":"पोलिश","ru":"रूसी","et":"एस्टोनियाई","lv":"लातवियाई","uk":"यूक्रेनी","is":"आइसलैंडिक",
        "fr":"फ़्रेंच","fi":"फ़िनिश","se":"स्वीडिश","no":"नॉर्वेजियन","de":"जर्मन","so":"सोमाली","ga":"आयरिश","cy":"वेल्श","zh":"चीनी",
        "pt":"पुर्तगाली","hi":"हिंदी","bn":"बंगाली","ur":"उर्दू",
    },
    "bn": {
        "lt":"লিথুয়ানীয়","en":"ইংরেজি","mx":"স্প্যানিশ","pl":"পোলিশ","ru":"রুশ","et":"এস্তোনীয়","lv":"লাত্ভীয়","uk":"ইউক্রেনীয়","is":"আইসল্যান্ডীয়",
        "fr":"ফরাসি","fi":"ফিনিশ","se":"সুইডিশ","no":"নরওয়েজীয়","de":"জার্মান","so":"সোমালি","ga":"আইরিশ","cy":"ওয়েলশ","zh":"চীনা",
        "pt":"পর্তুগিজ","hi":"হিন্দি","bn":"বাংলা","ur":"উর্দু",
    },
    "ur": {
        "lt":"لتھوینیائی","en":"انگریزی","mx":"ہسپانوی","pl":"پولش","ru":"روسی","et":"ایسٹونین","lv":"لاٹوین","uk":"یوکرینی","is":"آئس لینڈک",
        "fr":"فرانسیسی","fi":"فنش","se":"سویڈش","no":"ناروےی","de":"جرمن","so":"صومالی","ga":"آئرش","cy":"ویلش","zh":"چینی",
        "pt":"پرتگالی","hi":"ہندی","bn":"بنگالی","ur":"اردو",
    },
}

# Patch each native UI language block
for native in native_langs:
    if native not in u or not isinstance(u.get(native), dict):
        u[native] = {}

    # ensure baseline keys exist by copying from en (non-destructive)
    for k, v in en.items():
        u[native].setdefault(k, v)

    # basics token
    if native in BASICS:
        u[native]["basics"] = BASICS[native]

    # language names for pill/course labels
    names = LANG_NAMES.get(native)
    if names:
        for course_code, localized in names.items():
            u[native][f"lang_{course_code}"] = localized

json.dump(u, open(UI_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"Patched {UI_PATH} | backup: {BACKUP}")
print("Native UI langs now:", ", ".join(sorted(u.keys())))
