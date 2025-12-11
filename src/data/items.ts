export interface WishListItem {
    id: string;
    brand: string;
    name: string;
    price?: string;
    url?: string;
    specs: {
        label: string;
        value: string;
    }[];
    status: 'wanted' | 'purchased' | 'not available';
}

export const items: WishListItem[] = [
    {
        id: "001",
        brand: "Vans",
        name: "Vans SK8-Low",
        url: "https://vans.org.ua/ua/kedi-vans-sk8-low-kedi-vn0a4uuk6bt1-ua",
        status: "wanted",
        specs: [
            { label: "SIZE", value: "41-42" },
            { label: "COLOR", value: "Black/White" }
            
        ]
    },
    {
        id: "002",
        brand: "Football Jersey",
        name: "Fernando Torres Jersey",
        url: "",
        status: "wanted",
        specs: [
            { label: "SIZE", value: "S-M" },
            { label: "TEAM", value: "Spain / Chelsea" }
        ]
    },
    {
        id: "003",
        brand: "Music",
        name: "Kurt Cobain Sweater",
        url: "",
        status: "wanted",
        specs: [
            { label: "SIZE", value: "S-M" }
        ]
    },
    {
        id: "004",
        brand: "Zara",
        name: "Boxy Fit T-Shirt",
        url: "https://www.zara.com/ua/uk/%D0%B2%D0%B0%D1%80%D0%B5%D0%BD%D0%B0-%D1%84%D1%83%D1%82%D0%B1%D0%BE%D0%BB%D0%BA%D0%B0-boxy-fit-%D0%B7-%D0%BB%D0%B5%D0%B3%D0%BA%D0%BE%D1%96-%D1%82%D0%BA%D0%B0%D0%BD%D0%B8%D0%BD%D0%B8-p06462400.html?v1=455181031&v2=2432004",
        status: "wanted",
        specs: [
            { label: "SIZE", value: "S-M" }
        ]
    },
    {
        id: "005",
        brand: "Japanese/Korean Pants",
        name: "Toji Fushiguro Pants",
        url: "https://www.temu.com/ua-en/japanese-and-korean-mens-pants-loose-plus-size-elastic-waist---hanging-style-haren-pants-for-mens-casual-9-inch-pants-g-601103124763078.html?top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2Fdfff73fc-6f4a-4878-aef4-b89b45681f23.jpg&spec_id=3002&spec_gallery_id=176504&refer_page_sn=10005&refer_source=0&freesia_scene=1&_oak_freesia_scene=1&_oak_rec_ext_1=NzE0MTM&_oak_gallery_order=42630514%2C1224118582%2C1775757997%2C160594523%2C2092824880&_oak_mp_inf=EMaj5tGz1ogBGiAzZmE5MWM2MWQ4Yzc0OTk2YjYyZTY3YjA1ZDQzNGViNSDU2Lf%2BsDM%3D&spec_ids=3002%2C16093%2C2001%2C16091&_x_sff=1&refer_page_el_sn=200024&refer_page_name=home&refer_page_id=10005_1765496703426_wb13iauysi&_x_sessn_id=bi1w3lh51j",
        status: "wanted",
        specs: [
            { label: "SIZE", value: "48-52" }
        ]
    },
    {
        id: "006",
        brand: "T-Shirt",
        name: "Black/White Oversized T-Shirt",
        url: "",
        status: "wanted",
        specs: [
            { label: "SIZE", value: "XL-2XL" }
        ]
    },
    {
        id: "007",
        brand: "Zara",
        name: "Muscle Tee Fit",
        url: "https://www.zara.com/ua/uk/%D1%84%D1%83%D1%82%D0%B1%D0%BE%D0%BB%D0%BA%D0%B0-muscle-tee-fit-p00722404.html?v1=495716776",
        status: "wanted",
        specs: [
            { label: "SIZE", value: "S-M" }
        ]
    },
    {
        id: "008",
        brand: "Jewelry",
        name: "Кліпса з хрестиком",
        url: "",
        status: "wanted",
        specs: []
    },
]