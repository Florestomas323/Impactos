import { useState, useMemo } from "react";
import { Ico } from "../../iconos";
import { RP } from "../../theme";
import { Modal, Field, inpLight } from "../../components/primitives";

const __CatalogoModule = (function () {

const CATALOGO_RP = [
{"c":"CU0056","n":"RP BLOQUE PARA CUCHILLOS","f":"Bloque para cuchillos Royal Prestige","g":"Cuchilleria","k":"cuchillo, knife, cortar, cuchilleria, porta cuchillos, bloque"},
{"c":"CU0148","n":"CUCHILLO SANTOKU DAMASCUS DE 5\"","f":"Cuchillo Santoku de Damasco de 5 pulgadas","g":"Cuchilleria","k":"cuchillo, knife, cortar, cuchilleria"},
{"c":"CU0740","n":"JGO DE 4 CUCHILLOS PARA CHURRASCO","f":"Juego de 4 cuchillos para churrasco","g":"Cuchilleria","k":"cuchillo, knife, cortar, cuchilleria"},
{"c":"CU0800","n":"RP JUEGO DE CUCHILLOS 5PZS","f":"Juego de 5 piezas de cuchillos Royal Prestige","g":"Cuchilleria","k":"cuchillo, knife, cortar, cuchilleria"},
{"c":"CU0810","n":"RP CUCHILLO PARA PELAR 2.75\"","f":"Cuchillo Royal Prestige de 2.75 pulgadas para pelar","g":"Cuchilleria","k":"cuchillo, knife, cortar, cuchilleria"},
{"c":"CU0814","n":"RP CUCHILLO MULTIUSO 5\"","f":"Cuchillo Royal Prestige multiuso de 5 pulgadas","g":"Cuchilleria","k":"cuchillo, knife, cortar, cuchilleria"},
{"c":"CU0815","n":"RP JUEGO PARA REBANAR 4PZS","f":"Juego de 4 piezas Royal Prestige para rebanar","g":"Cuchilleria","k":"cuchillo, knife, cortar, cuchilleria"},
{"c":"CU0820","n":"RP JGO CUCHILLOS PARA CARNE 4PZS","f":"Juego de 4 piezas de cuchillos Royal Prestige para carne","g":"Cuchilleria","k":"cuchillo, knife, cortar, cuchilleria"},
{"c":"CU0825","n":"RP HACHA DE COCINA 7\"","f":"Hacha de cocina Royal Prestige de 7 pulgadas","g":"Cuchilleria","k":"cuchillo, knife, cortar, cuchilleria"},
{"c":"CU0932","n":"RP TODO EN 1 BLOQUE CUCHILLOS CHURRASCO","f":"Bloque Royal Prestige \"todo en uno\" con cuchillos para churrasco","g":"Cuchilleria","k":"cuchillo, knife, cortar, cuchilleria, porta cuchillos, bloque"},
{"c":"SP0296","n":"RP CUCHILLO SANTOKU 5\"","f":"Cuchillo Santoku Royal Prestige de 5 pulgadas","g":"Cuchilleria","k":"cuchillo, knife, cortar, cuchilleria"},
{"c":"SP0297","n":"RP CUCHILLO SANTOKU 3.5\"/8.89CM","f":"Cuchillo Santoku Royal Prestige de 3.5 pulgadas o 8.89 cm","g":"Cuchilleria","k":"cuchillo, knife, cortar, cuchilleria"},
{"c":"ES0014","n":"POWER BLENDER JARRA TRITAN COMPLETA","f":"","g":"Electrodomesticos","k":"licuadora, blender, efecto piedra, antiadherente"},
{"c":"ES0071","n":"RP PRECISION COOK 120-127V TIPO B","f":"Cocina de precisión Royal Prestige 120-127 voltios tipo B","g":"Electrodomesticos","k":"estufa, cocina, parrilla electrica, hornilla, induccion"},
{"c":"ES0082","n":"RP POWER BLENDER MAX 120-127V VPU","f":"Licuadora Power Blender Max Royal Prestige 120-127 voltios por unidad","g":"Electrodomesticos","k":"licuadora, blender, licuadora grande, efecto piedra, antiadherente"},
{"c":"ES4200","n":"RP PB GO PLUS TIPO A C/BATIDOR & CEPILLO","f":"Royal Prestige Power Blender Go Plus tipo A con batidor y cepillo","g":"Electrodomesticos","k":"batidor, licuadora portatil, mini licuadora, inmersion"},
{"c":"JU0038","n":"EXTRACTOR DE JUGOS RP CON RECETARIO","f":"Extractor de jugos Royal Prestige con recetario","g":"Electrodomesticos","k":"extractor, juguera, jugos, juicer, recetario, recetas"},
{"c":"PE0028","n":"CONJUNTO PICADORA Y TAZA - BLENDER GO","f":"Conjunto de picadora y taza para Blender Go","g":"Electrodomesticos","k":"batidor, licuadora portatil, mini licuadora, inmersion, tazas, termo, cafe, efecto piedra, antiadherente"},
{"c":"PE0029","n":"CONJUNTO BATIDOR & CEPILLO - BLENDER GO","f":"Conjunto de batidor y cepillo para Blender Go","g":"Electrodomesticos","k":"batidor, licuadora portatil, mini licuadora, inmersion, efecto piedra, antiadherente"},
{"c":"PE0040","n":"RP FRESH MAX / ADAPTADOR TIPO A","f":"Royal Prestige Fresh Max/Adaptador tipo A","g":"Electrodomesticos","k":"sellado al vacio, bomba de vacio, conservar alimentos"},
{"c":"PE0050","n":"JARRA TRITAN COMPLETA RP PB MAX","f":"Jarra completa Tritan Royal Prestige para Power Blender Max","g":"Electrodomesticos","k":"licuadora, blender, licuadora grande"},
{"c":"PE0051","n":"RP MAX CUP (2) C/ASPAS","f":"2 vasos Max Cup Royal Prestige con aspas","g":"Electrodomesticos","k":"vaso licuadora, licuadora personal, smoothie"},
{"c":"PE4000","n":"ROYAL PRESTIGE WARMER PRO","f":"Calentador profesional Royal Prestige - tortillera","g":"Electrodomesticos","k":"calentador de comida, plato caliente, food warmer"},
{"c":"SP3303","n":"PAQT 6 JARRA VORT-X 2.5.1 COMPLETA","f":"Paquete de 6 jarras Vort-X 2.5.1 completas","g":"Electrodomesticos","k":"jarra, vortex"},
{"c":"CO9144","n":"OLLA ROYAL PRESTIGE 60QT Y PARRILLA","f":"Olla Royal Prestige de 60 cuartos con parrilla","g":"Especial y Promociones","k":"tamalera, olla grande, vaporera, tamales, olla gigante, rejilla, base para tamales, olla, cocinar, pot"},
{"c":"CO9267","n":"OLLA 12QT CON PARRILLA INNOVE 316L","f":"Olla de 12 cuartos con parrilla Innové 316L","g":"Especial y Promociones","k":"tamalera, olla grande, vaporera, tamales, rejilla, base para tamales, olla, cocinar, pot, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9269","n":"OLLA 30QT/38CM Y PARRILLA INNOVE 316L","f":"Olla de 30 cuartos o 38 cm con parrilla Innové 316L","g":"Especial y Promociones","k":"tamalera, olla grande, vaporera, tamales, rejilla, base para tamales, olla, cocinar, pot, innove, linea innove, 316L, titanio quirurgico"},
{"c":"AP2704","n":"RP FILTRO AIRE PAQUETE REEMPLAZO","f":"Paquete de reemplazo de filtro de aire Royal Prestige","g":"Filtracion","k":"purificador de aire, aire"},
{"c":"AP2801","n":"RP FILTRO DE AIRE 120-127V TIPO A","f":"Filtro de aire Royal Prestige de 120-127 voltios tipo A","g":"Filtracion","k":"purificador de aire, aire"},
{"c":"PR0333","n":"ROYAL PRESTIGE FILTRO DE DUCHA","f":"Filtro de ducha Royal Prestige","g":"Filtracion","k":"filtro de ducha, regadera, shower"},
{"c":"PR2002","n":"2 UNIDADES DE PREFILTRO","f":"2 unidades de prefiltro","g":"Filtracion","k":"repuesto filtro, cartucho, filtro de agua"},
{"c":"PR2003","n":"1 UNIDAD FILTRO OSMOSIS INVERSA","f":"1 unidad de filtro de ósmosis inversa","g":"Filtracion","k":"osmosis inversa, filtro de agua"},
{"c":"PR2004","n":"1 UND MINERALIZADOR + 1 UND FILTRO CARBON","f":"1 unidad de mineralizador y 1 unidad de filtro de carburo","g":"Filtracion","k":"filtro de agua, minerales"},
{"c":"RP0140","n":"CARTUCHO DE SEDIMENTO DE 10\"","f":"Cartucho de sedimento de 10 pulgadas","g":"Filtracion","k":"repuesto filtro, cartucho, filtro de agua"},
{"c":"RP4621","n":"RP KIT REEMPLAZO CUBIERTA DE DUCHA","f":"Kit de reemplazo Royal Prestige para cubierta de ducha","g":"Filtracion","k":"filtro de ducha, regadera, shower"},
{"c":"RP6186","n":"VALVULA DESVIO - DOBLE MANGUERA METAL","f":"Válvula de desvío con doble manguera de metal","g":"Filtracion","k":"royal prestige"},
{"c":"RP6196","n":"VALVULA DE METAL - MANGUERA SIMPLE","f":"Válvula de metal con manguera simple","g":"Filtracion","k":"royal prestige"},
{"c":"RP9003","n":"RP FRESCAFLOW KIT DE MUDANZA","f":"Kit de mudanza Royal Prestige Frescaflow","g":"Filtracion","k":"filtro de agua, purificador, agua"},
{"c":"WF0060","n":"PRE-FILTRO DE 10\" CON 3 CARTUCHOS","f":"Prefiltro de 10 pulgadas con 3 cartuchos","g":"Filtracion","k":"filtro de agua, purificador, agua, repuesto filtro, cartucho"},
{"c":"WF0075","n":"DOS (2) CARTUCHOS FILTRO P/DUCHA","f":"2 cartuchos de filtro para ducha","g":"Filtracion","k":"filtro de agua, purificador, agua, filtro de ducha, regadera, shower, repuesto filtro, cartucho"},
{"c":"WF0080","n":"SEIS (6) CARTUCHOS FILTRO P/DUCHA","f":"6 cartuchos de filtro para ducha","g":"Filtracion","k":"filtro de agua, purificador, agua, filtro de ducha, regadera, shower, repuesto filtro, cartucho"},
{"c":"WF0382","n":"PREFILTRO P/SEDIMENTOS 5 MICRONES","f":"Prefiltro para sedimentos de 5 micrones","g":"Filtracion","k":"filtro de agua, purificador, agua, repuesto filtro, cartucho"},
{"c":"WF0419","n":"FILTRO DE AGUA FRESCAPURE 3500 CT","f":"Filtro de agua Frescasure 3500 CT","g":"Filtracion","k":"filtro de agua, purificador, agua"},
{"c":"WF0482","n":"FRESCAPURE 5500 SOBRE MOSTRADOR","f":"Frescasure 5500 para mostrador","g":"Filtracion","k":"filtro de agua, purificador, agua"},
{"c":"WF0485","n":"FRESCAPURE 5500 BAJO MOSTRADOR","f":"Frescasure 5500 para debajo del mostrador","g":"Filtracion","k":"filtro de agua, purificador, agua"},
{"c":"WF0490","n":"RP 4.5\" NSF CERT CARTUCHO DE REEMPLAZO","f":"","g":"Filtracion","k":"filtro de agua, purificador, agua, repuesto filtro, cartucho"},
{"c":"WF0491","n":"FP3K/PLUS/3500 REPLACEMENT CARTRIDGE","f":"","g":"Filtracion","k":"filtro de agua, purificador, agua, repuesto filtro, cartucho"},
{"c":"WF0530","n":"CARTUCHO 4.5 C/CAPSULA P/BTR FP BAJO MOSTRADOR","f":"Cartucho de 4.5 pulgadas con cápsula para batería, para Frescasure bajo mostrador","g":"Filtracion","k":"filtro de agua, purificador, agua, repuesto filtro, cartucho"},
{"c":"WF0653","n":"UNIDAD ULTRAVIOLETA - FP ULTRA","f":"Unidad ultravioleta para Frescasure Ultra","g":"Filtracion","k":"filtro de agua, purificador, agua, uv, esterilizador"},
{"c":"WF0654","n":"FP ULTRA - 3 FILTROS DE REEMPLAZO","f":"Frescasure Ultra - 3 filtros de reemplazo","g":"Filtracion","k":"filtro de agua, purificador, agua"},
{"c":"WF1200","n":"RP FRESCAFLOW 100-240V & MINERALIZADOR","f":"Royal Prestige Frescaflow de 100 a 240 voltios con mineralizador","g":"Filtracion","k":"filtro de agua, purificador, agua, minerales"},
{"c":"CO1678","n":"6 PC GOURMET (PANS W/COVERS) 5PLY","f":"6 piezas Gourmet (sartenes con cubiertas) de 5 capas","g":"Juegos de Ollas","k":"gourmet, 5 capas"},
{"c":"CO3000","n":"RP ELITE SET 5PZ C/3 PROTECTORES SARTENES","f":"Royal Prestige Elite de 5 piezas con cubiertas y protector de 3 piezas","g":"Juegos de Ollas","k":"sarten, freir, frying pan, elite, linea elite"},
{"c":"CO3011","n":"RP ELITE SARTEN 26CM/3.5QT C/TAPA","f":"Royal Prestige Elite sartén para saltear de 26 cm / 3.5 cuartos con cubierta","g":"Juegos de Ollas","k":"sarten, freir, frying pan, elite, linea elite"},
{"c":"CO3012","n":"RP ELITE OLLA 22CM/4QT C/TAPA","f":"Royal Prestige Elite horno holandés de 22 cm / 4 cuartos con cubierta","g":"Juegos de Ollas","k":"olla, cocinar, pot, elite, linea elite"},
{"c":"CO3013","n":"RP ELITE SARTEN 10\"","f":"Royal Prestige Elite sartén de 10 pulgadas","g":"Juegos de Ollas","k":"sarten, freir, frying pan, elite, linea elite"},
{"c":"CO3014","n":"RP ELITE SARTEN 8\"","f":"Royal Prestige Elite sartén de 8 pulgadas","g":"Juegos de Ollas","k":"sarten, freir, frying pan, elite, linea elite"},
{"c":"CO3015","n":"RP ELITE TAPA 26CM","f":"","g":"Juegos de Ollas","k":"elite, linea elite"},
{"c":"CO4911","n":"ROYAL PRESTIGE MULTIPAN","f":"Multiguisado Royal Prestige","g":"Juegos de Ollas","k":"olla multiusos, vaporera, silbato, multiuso"},
{"c":"CO7014","n":"SIST COCINA COMPLEMENTO 5CPS-5PZS C/CATALOGO","f":"Sistema de cocina complementario de 5 capas y 5 piezas con catálogo","g":"Juegos de Ollas","k":"5 capas, catalogo"},
{"c":"CO7024","n":"SIST COCINA CLASICO 5 CAPAS 7PZS C/CATALOGO","f":"Sistema de cocina Clásico de 5 capas y 7 piezas con catálogo","g":"Juegos de Ollas","k":"5 capas, catalogo"},
{"c":"CO7034","n":"SIST CLASICO 5CPS 8PZS C/CATALOGO","f":"Sistema Clásico de 5 capas y 8 piezas con catálogo","g":"Juegos de Ollas","k":"5 capas, catalogo"},
{"c":"CO7054","n":"SIST COCINA PROFESIONAL 5CPS 15PZS C/CATALOGO","f":"Sistema de cocina Profesional de 5 capas y 15 piezas con catálogo","g":"Juegos de Ollas","k":"5 capas, catalogo"},
{"c":"CO8020","n":"SIST COCINA CLASICO 5 CAPAS 7 PZAS","f":"Sistema de cocina Clásico de 5 capas y 7 piezas","g":"Juegos de Ollas","k":"5 capas"},
{"c":"CO8030","n":"SIST COCINA ESPECIAL 5 CAPAS 8 PZAS","f":"Sistema de cocina Especial de 5 capas y 8 piezas","g":"Juegos de Ollas","k":"5 capas"},
{"c":"CO8040","n":"SIST COCINA FAMILIAR DE 5CPS 10PZS","f":"","g":"Juegos de Ollas","k":"5 capas"},
{"c":"CO9251","n":"CLASICO 7PZS INNOVE 316L + MATERIAL APOYO","f":"Juego Clásico de 7 piezas Innové 316L con material de apoyo","g":"Juegos de Ollas","k":"innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9256","n":"ESPECIAL 8PZS INNOVE 316L + MATERIAL APOYO","f":"Juego Especial de 8 piezas Innové 316L con material de apoyo","g":"Juegos de Ollas","k":"innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9265","n":"JGO SARTENES GOURMET 6PZS INNOVE 316L","f":"Juego de sartenes Gourmet de 6 piezas Innové 316L","g":"Juegos de Ollas","k":"sarten, freir, frying pan, innove, linea innove, gourmet, 316L, titanio quirurgico"},
{"c":"CO9554","n":"SISTEMA DE 15 PZAS NOVEL SIN CATALOGO","f":"Sistema Novel de 15 piezas sin catálogo","g":"Juegos de Ollas","k":"novel, linea novel, catalogo"},
{"c":"CO9563","n":"SISTEMA NOVEL 7 PZS SIN CATALOGO","f":"Sistema Novel de 7 piezas sin catálogo","g":"Juegos de Ollas","k":"novel, linea novel, catalogo"},
{"c":"CO9573","n":"SISTEMA NOVEL 8 PZS SIN CATALOGO","f":"Sistema Novel de 8 piezas sin catálogo","g":"Juegos de Ollas","k":"novel, linea novel, catalogo"},
{"c":"CO9655","n":"JGO 6PZS GOURMET (SARTENES C/TAPA)","f":"Juego de 6 piezas Gourmet (sartenes con tapa)","g":"Juegos de Ollas","k":"sarten, freir, frying pan, gourmet"},
{"c":"CO9736","n":"8\" DER SARTEN EFECTO PIEDRA + 3PZ UTENSILIOS","f":"Sartén de 8 pulgadas de Easy Release con efecto de piedra y 3 piezas de utensilio","g":"Juegos de Ollas","k":"sarten, freir, frying pan, efecto piedra, antiadherente, utensilios, servir"},
{"c":"CO9738","n":"10\" DER SARTEN EFECTO PIEDRA + 3PZ UTENSILIOS","f":"Sartén de 10 pulgadas de Easy Release con efecto de piedra y 3 piezas de utensilio","g":"Juegos de Ollas","k":"sarten, freir, frying pan, efecto piedra, antiadherente, utensilios, servir"},
{"c":"CO9739","n":"12\" DER SARTEN EFECTO PIEDRA + 3PZ UTENSILIOS","f":"Sartén de 12 pulgadas de Easy Release con efecto de piedra y 3 piezas de utensilio","g":"Juegos de Ollas","k":"sarten, freir, frying pan, efecto piedra, antiadherente, utensilios, servir"},
{"c":"CO9740","n":"6PC SET DER EFECTO PIEDRA 3PZ UTENSILIOS","f":"Juego de 6 piezas de Easy Release con efecto de piedra y 3 piezas de utensilio","g":"Juegos de Ollas","k":"efecto piedra, antiadherente, utensilios, servir"},
{"c":"CO9777","n":"2QT/18CM ER OLLA C/TAPA VIDRIO/3PZ UTEN","f":"Olla de 2 cuartos o 18 cm de Easy Release con tapa de vidrio y 3 piezas de utensilio","g":"Juegos de Ollas","k":"olla, cocinar, pot, antiadherente, easy release"},
{"c":"CO9778","n":"3QT/20CM ER OLLA C/TAPA VIDRIO/3PZ UTEN","f":"Olla de 3 cuartos o 20 cm de Easy Release con tapa de vidrio y 3 piezas de utensilio","g":"Juegos de Ollas","k":"olla, cocinar, pot, antiadherente, easy release"},
{"c":"CO9779","n":"3.5QT/26CM ER SAUTE/TAPA VIDRIO/3PZ UTEN","f":"Sartén para saltear de 3.5 cuartos o 26 cm de Easy Release con tapa de vidrio y 3 piezas de utensilio","g":"Juegos de Ollas","k":"antiadherente, easy release"},
{"c":"CO9780","n":"RP EASY RELEASE OLLAS & SARTEN 6 PZS","f":"Juego de ollas y sartén Royal Prestige Easy Release de 6 piezas","g":"Juegos de Ollas","k":"sarten, freir, frying pan, antiadherente, easy release"},
{"c":"CO9840","n":"NOVEL 10PZ SC FAMILIAR (TAPA ALTA)","f":"","g":"Juegos de Ollas","k":"novel, linea novel"},
{"c":"CO9846","n":"INNOVE 5PZ + CATALOGO + PERFECT POP","f":"Juego Innové de 5 piezas con catálogo y Perfect Pop","g":"Juegos de Ollas","k":"palomitas, popcorn, crispetas, cotufas, innove, linea innove, catalogo"},
{"c":"CO9861","n":"INNOVE 10PZ + PERFECT POP","f":"Juego Innové de 10 piezas con Perfect Pop","g":"Juegos de Ollas","k":"palomitas, popcorn, crispetas, cotufas, innove, linea innove"},
{"c":"CO9883","n":"NOVEL 10PZ + CATALOGO + POP","f":"Juego Novel de 10 piezas con catálogo y Pop","g":"Juegos de Ollas","k":"novel, linea novel, catalogo"},
{"c":"CO9893","n":"NOVEL 5PZ + CATALOGO + POP","f":"Juego Novel de 5 piezas con catálogo y Pop","g":"Juegos de Ollas","k":"novel, linea novel, catalogo"},
{"c":"SP7008","n":"KIT DE 5 CAPAS PARA EL NOVATO","f":"Kit de 5 capas para el novato","g":"Kits Novato","k":"5 capas, kit inicial, demo, nuevo distribuidor, arranque"},
{"c":"SP9001","n":"KIT INNOVE PARA EL NOVATO","f":"Kit Innové para el novato","g":"Kits Novato","k":"innove, linea innove, kit inicial, demo, nuevo distribuidor, arranque"},
{"c":"SP9005","n":"KIT NOVEL PARA EL NOVATO","f":"Kit Novel para el novato","g":"Kits Novato","k":"kit inicial, demo, nuevo distribuidor, arranque"},
{"c":"LT0005","n":"CATALOGO DE PRODUCTOS 5 CAPAS ING/ESP","f":"Catálogo de productos de 5 capas en inglés y español","g":"Literatura de Venta","k":"5 capas, folleto, material de venta, papeleria, catalogo"},
{"c":"LT0043","n":"MEGA BROCHURE ELITE COOKING SYSTEM","f":"","g":"Literatura de Venta","k":"elite, linea elite, folleto, material de venta, papeleria"},
{"c":"LT0102","n":"FOLLETO CHOCOLATERA","f":"Folleto Chocolatera","g":"Literatura de Venta","k":"chocolate caliente, champurrado, olla chocolate, folleto, material de venta, papeleria"},
{"c":"LT0105","n":"FOLLETO EXPERTEA ESPAÑOL-INGLES","f":"Folleto Expertea en inglés y español","g":"Literatura de Venta","k":"tetera, te, infusor, tea, folleto, material de venta, papeleria"},
{"c":"LT0131","n":"FOLLETO PRECISION COOK","f":"Folleto Precision Cook","g":"Literatura de Venta","k":"estufa, cocina, parrilla electrica, hornilla, induccion, folleto, material de venta, papeleria"},
{"c":"LT0601","n":"FOLLETO FRESCAPURE 5500 ESPAÑOL","f":"Folleto Frescasure 5500 en español","g":"Literatura de Venta","k":"filtro de agua, purificador, agua, folleto, material de venta, papeleria"},
{"c":"LT1199","n":"RECETARIO INNOVE Y NOVEL ING/ESP","f":"Recetario Innové y Novel en inglés y español","g":"Literatura de Venta","k":"innove, linea innove, novel, linea novel, folleto, material de venta, papeleria, recetario, recetas"},
{"c":"LT2189","n":"RECETARIO OLLA DE PRESION","f":"","g":"Literatura de Venta","k":"olla express, pressure cooker, olla pitadora, presion, olla, cocinar, pot, folleto, material de venta, papeleria, recetario, recetas"},
{"c":"LT2268","n":"FOLLETO DE EXTRACTOR DE JUGOS RP","f":"Folleto de extractor de jugos Royal Prestige","g":"Literatura de Venta","k":"extractor, juguera, jugos, juicer, folleto, material de venta, papeleria"},
{"c":"LT2377","n":"FOLLETO OLLAS DE PRESION","f":"","g":"Literatura de Venta","k":"olla express, pressure cooker, olla pitadora, presion, folleto, material de venta, papeleria"},
{"c":"LT2597","n":"FOLLETO DEL FRESCAPURE 3500 ESP","f":"Folleto del Frescasure 3500 en español","g":"Literatura de Venta","k":"filtro de agua, purificador, agua, folleto, material de venta, papeleria"},
{"c":"LT2661","n":"SUPER FOLLETO MAQUINA P/ENSALADA","f":"Súper folleto de máquina para ensalada","g":"Literatura de Venta","k":"cortador de verduras, rallador, ensaladas, procesador, folleto, material de venta, papeleria"},
{"c":"LT2900","n":"CATALOGO RP NOVEL ESP/ING","f":"Catálogo Royal Prestige Novel en español e inglés","g":"Literatura de Venta","k":"novel, linea novel, folleto, material de venta, papeleria, catalogo"},
{"c":"LT2917","n":"CATALOGO EASY RELEASE TAPA VIDRIO","f":"Catálogo Easy Release de tapa de vidrio","g":"Literatura de Venta","k":"antiadherente, easy release, folleto, material de venta, papeleria, catalogo"},
{"c":"LT3206","n":"FOLLETO POWER BLENDER GO","f":"Folleto Power Blender Go","g":"Literatura de Venta","k":"batidor, licuadora portatil, mini licuadora, inmersion, efecto piedra, antiadherente, folleto, material de venta, papeleria"},
{"c":"LT3211","n":"FOLLETO POWER BLENDER MAX","f":"Folleto Power Blender Max","g":"Literatura de Venta","k":"licuadora, blender, licuadora grande, efecto piedra, antiadherente, folleto, material de venta, papeleria"},
{"c":"LT4033","n":"CALENDARIO DE LA SUERTE RAFFLE 100PK","f":"Calendario del sorteo de la suerte, paquete de 100","g":"Literatura de Venta","k":"folleto, material de venta, papeleria"},
{"c":"LT4900","n":"FOLLETO ROYAL PRESTIGE MIXING BOWL","f":"Folleto Royal Prestige Mixing Bowl","g":"Literatura de Venta","k":"bowl, tazon, mezclar, batir, folleto, material de venta, papeleria"},
{"c":"LT4910","n":"FOLLETO ROYAL PRESTIGE MULTIPAN","f":"Folleto Royal Prestige Multiguisado","g":"Literatura de Venta","k":"olla multiusos, vaporera, silbato, multiuso, folleto, material de venta, papeleria"},
{"c":"LT4911","n":"MEGA BROCHURE MULTIPAN","f":"","g":"Literatura de Venta","k":"olla multiusos, vaporera, silbato, multiuso, folleto, material de venta, papeleria"},
{"c":"LT5260","n":"LIBRO DE RECETAS EXPERTEA","f":"Libro de recetas Expertea","g":"Literatura de Venta","k":"tetera, te, infusor, tea, folleto, material de venta, papeleria, recetario, recetas"},
{"c":"LT6310","n":"TRIPTICO OPORTUNIDAD INGLES PAQ 25","f":"Tríptico de oportunidad en inglés, paquete de 25","g":"Literatura de Venta","k":"folleto, material de venta, papeleria"},
{"c":"LT9002","n":"LAMINAS DE VENTAS INNOVE","f":"Láminas de ventas Innové","g":"Literatura de Venta","k":"innove, linea innove, folleto, material de venta, papeleria"},
{"c":"SP0001","n":"RP LUNCH BAG","f":"Bolsa de almuerzo Royal Prestige","g":"Materiales Clientes","k":"lonchera, bolsa de almuerzo"},
{"c":"SP0002","n":"RP ELITE BASE MAGNETICA","f":"","g":"Materiales Clientes","k":"elite, linea elite"},
{"c":"SP0066","n":"TAZON MEZCLAR 10QT C/BASE SILICONA","f":"Tazón para mezclar de 100T con base de silicona","g":"Materiales Clientes","k":"bowl, tazon, mezclar, batir"},
{"c":"SP0068","n":"TAZON 5 CUARTOS PARED DOBLE + TAPA","f":"Tazón de 5 cuartos con pared doble y tapa","g":"Materiales Clientes","k":"bowl, tazon, mezclar, batir"},
{"c":"SP0077","n":"DELUXE SERVING - CUCHARA","f":"","g":"Materiales Clientes","k":"utensilios, servir"},
{"c":"SP0078","n":"DELUXE SERVING - CUCHARA C/RANURAS","f":"","g":"Materiales Clientes","k":"utensilios, servir"},
{"c":"SP0079","n":"DELUXE SERVING - CUCHARA CUADRADA","f":"","g":"Materiales Clientes","k":"utensilios, servir"},
{"c":"SP0081","n":"NVO JGO P/SERVIR DELUXE 3PZS 430SS","f":"Nuevo juego Deluxe de 3 piezas de acero inoxidable 430 para servir","g":"Materiales Clientes","k":"utensilios, servir"},
{"c":"SP0088","n":"3PC NEW DELUXE SERVING SET 430SS 36PK","f":"Nuevo juego de 3 piezas de acero inoxidable 430 para servir, paquete de 36","g":"Materiales Clientes","k":"royal prestige"},
{"c":"SP0098","n":"JUEGO UTENSILIOS 3PZ EASY RELEASE","f":"Juego de 3 piezas de utensilios Easy Release","g":"Materiales Clientes","k":"antiadherente, easy release, utensilios, servir"},
{"c":"SP0111","n":"6 RECIPIENTES RP C/CAPACIDAD DE 2TZS","f":"6 recipientes Royal Prestige con capacidad de 2 tazas","g":"Materiales Clientes","k":"tuppers, contenedores, guardar comida"},
{"c":"SP0113","n":"RECIPIENTES DE COMIDA RP - 8 PIEZAS","f":"8 recipientes de comida Royal Prestige","g":"Materiales Clientes","k":"tuppers, contenedores, guardar comida"},
{"c":"SP0135","n":"JGO DE 4 TAZAS CON PARED DOBLE","f":"Juego de 4 tazas con pared doble","g":"Materiales Clientes","k":"tazas, termo, cafe"},
{"c":"SP0136","n":"JUEGO 2 TAZAS 16OZ CON PARED DOBLE","f":"Juego de 2 tazas de 16 onzas con pared doble","g":"Materiales Clientes","k":"tazas, termo, cafe"},
{"c":"SP0137","n":"TEQUILAS GLASS RP LOGO 4-PACK","f":"Vasos de tequila con logo de Royal Prestige, paquete de 4","g":"Materiales Clientes","k":"vasos, cristaleria, termo"},
{"c":"SP0145","n":"RECIPIENTE PARA UTENSILIOS","f":"Recipiente para utensilios","g":"Materiales Clientes","k":"tuppers, contenedores, guardar comida, utensilios, servir"},
{"c":"SP0152","n":"JUEGOS COMPLEMENTO 430SS + DLX + RECIPIENTE","f":"Juegos complementarios de acero inoxidable 430 más Deluxe y recipiente","g":"Materiales Clientes","k":"tuppers, contenedores, guardar comida"},
{"c":"SP0252","n":"JGO DE 2 COPAS P/HELADO C/PARED DOBLE","f":"Juego de 2 copas para helado con pared doble","g":"Materiales Clientes","k":"copas, vino, cristaleria"},
{"c":"SP0254","n":"JGO DE RECIPIENTES P/HELADO 4 PIEZAS","f":"Juego de 4 recipientes para helado","g":"Materiales Clientes","k":"tuppers, contenedores, guardar comida"},
{"c":"SP0261","n":"JGO AZUCAR/JARRO P/LECHE ACERO 2PZ","f":"Juego de azúcar y jarra de acero de 2 piezas para leche","g":"Materiales Clientes","k":"royal prestige"},
{"c":"SP0305","n":"BASE MAGNETICA PARA OLLAS","f":"Base magnética para ollas","g":"Materiales Clientes","k":"royal prestige"},
{"c":"SP1850","n":"DESTAPADOR PRECISION SERIES","f":"Destapador Precision Series","g":"Materiales Clientes","k":"utensilio, precision, abrelatas, abridor"},
{"c":"SP1851","n":"RALLADOR PRECISION SERIES","f":"Rallador Precision Series","g":"Materiales Clientes","k":"utensilio, precision, rallar, queso"},
{"c":"SP1852","n":"ESPATULA PRECISION SERIES","f":"Espátula Precision Series","g":"Materiales Clientes","k":"utensilio, precision, utensilios, servir"},
{"c":"SP1853","n":"BATIDOR DE GLOBO PRECISION SERIES","f":"Batidor de globo Precision Series","g":"Materiales Clientes","k":"utensilio, precision, batir, huevos, globo"},
{"c":"SP1854","n":"PELADOR PRECISION SERIES","f":"Pelador Precision Series","g":"Materiales Clientes","k":"utensilio, precision, pelar, verduras"},
{"c":"SP1856","n":"CORTAPIZZA PRECISION SERIES","f":"Corta pizza Precision Series","g":"Materiales Clientes","k":"utensilio, precision, pizza, cortador"},
{"c":"SP1857","n":"MACHACADOR PRECISION SERIES","f":"Machacador Precision Series","g":"Materiales Clientes","k":"utensilio, precision, pure, papas, aplastador"},
{"c":"SP1859","n":"ESPATULA P/HELADOS PRECISION SERIES","f":"Espátula para helados Precision Series","g":"Materiales Clientes","k":"utensilio, precision, utensilios, servir"},
{"c":"SP1860","n":"PELADOR VERTICAL PRECISION SERIES","f":"Pelador vertical Precision Series","g":"Materiales Clientes","k":"utensilio, precision, pelar, verduras"},
{"c":"SP1861","n":"JGO DE 2 ESPATULAS DE SILICONA PS","f":"Juego de 2 espátulas de silicona Precision Series","g":"Materiales Clientes","k":"utensilio, precision, utensilios, servir"},
{"c":"SP2551","n":"ROYAL PRESTIGE SMART TEMP","f":"Royal Prestige Smart Temp","g":"Materiales Clientes","k":"indicador de temperatura, termometro, sensor"},
{"c":"SP2881","n":"RP PAQUETE DE 10 UND SMART TEMP","f":"Paquete Royal Prestige de 10 unidades de Smart Temp","g":"Materiales Clientes","k":"indicador de temperatura, termometro, sensor"},
{"c":"CO8820","n":"COLADOR PEQUEÑO (20CM) 5Y9 CAPAS","f":"Colador pequeño de 20 cm de 5 y 9 capas","g":"Miscelaneos","k":"colador, escurridor, strainer, 9 capas"},
{"c":"CO9076","n":"COLADOR PEQUEÑO (20CM) INNOVE","f":"Colador pequeño de 20 cm Innové","g":"Miscelaneos","k":"colador, escurridor, strainer, innove, linea innove"},
{"c":"CO9080","n":"COLADOR GRANDE (26CM) INNOVE","f":"Colador grande de 26 cm Innové","g":"Miscelaneos","k":"colador, escurridor, strainer, innove, linea innove"},
{"c":"CO9096","n":"PARRILLA PARA OLLA DE 12QT INNOVE","f":"Parrilla para olla Innové de 12 cuartos","g":"Miscelaneos","k":"tamalera, olla grande, vaporera, tamales, rejilla, base para tamales, olla, cocinar, pot, innove, linea innove"},
{"c":"CO9097","n":"PARRILLA PARA OLLA DE 20QT INNOVE","f":"Parrilla para olla Innové de 20 cuartos","g":"Miscelaneos","k":"tamalera, olla grande, vaporera, tamales, rejilla, base para tamales, olla, cocinar, pot, innove, linea innove"},
{"c":"CO9098","n":"PARRILLA PARA OLLA DE 30QT INNOVE","f":"Parrilla para olla Innové de 30 cuartos","g":"Miscelaneos","k":"tamalera, olla grande, vaporera, tamales, rejilla, base para tamales, olla, cocinar, pot, innove, linea innove"},
{"c":"CO9099","n":"PARRILLA P/OLLA DE 60 CUARTOS RP","f":"Parrilla para olla Royal Prestige de 60 cuartos","g":"Miscelaneos","k":"tamalera, olla grande, vaporera, tamales, olla gigante, rejilla, base para tamales"},
{"c":"CO9615","n":"COLADOR PEQUEÑO (20CM) RP","f":"Colador pequeño de 20 cm Royal Prestige","g":"Miscelaneos","k":"colador, escurridor, strainer"},
{"c":"CO9690","n":"PARRILLA ACERO INOX 31CM OLLAS 20/30 RP","f":"Parrilla de acero inoxidable de 31 cm para ollas de 20/30 Royal Prestige","g":"Miscelaneos","k":"rejilla, base para tamales, vaporera, tamalera"},
{"c":"SP5050","n":"ROYALSHINE","f":"Royal Shine","g":"Miscelaneos","k":"limpiador, pulidor, acero inoxidable"},
{"c":"SP5054","n":"ROYAL SHINE - PAQUETE DE 12 UNIDADES","f":"Paquete de 12 unidades de Royal Shine","g":"Miscelaneos","k":"limpiador, pulidor, acero inoxidable"},
{"c":"LT2325","n":"NOTIFICACION CLIENTES ILLINOIS PQT 25","f":"Notificación a clientes de Illinois, paquete de 25","g":"Ordenes de Compra","k":"ordenes, contratos, papeleria, credito"},
{"c":"LT2700","n":"25 ORDENES VENTA RP MULTI ESTADO ING","f":"25 órdenes de venta Royal Prestige multi estado en inglés","g":"Ordenes de Compra","k":"ordenes, contratos, papeleria, credito"},
{"c":"LT2705","n":"25 ORDENES VENTA RP MULTI ESTADO ESP","f":"25 órdenes de venta Royal Prestige multi estado en español","g":"Ordenes de Compra","k":"ordenes, contratos, papeleria, credito"},
{"c":"LT2740","n":"25 SOLICITUDES CREDITO RP MULTI EDO RTVO ING","f":"25 solicitudes de crédito Royal Prestige multi estado rotativo en inglés","g":"Ordenes de Compra","k":"ordenes, contratos, papeleria, credito"},
{"c":"LT2745","n":"25 SOLICITUDES CREDITO RP MULTI EDO RTVO ESP","f":"25 solicitudes de crédito Royal Prestige multi estado rotativo en español","g":"Ordenes de Compra","k":"ordenes, contratos, papeleria, credito"},
{"c":"LT2750","n":"SOLICITUD GENERICA CREDITO ROTATIVO ING 25","f":"Solicitud genérica de crédito rotativo en inglés, paquete de 25","g":"Ordenes de Compra","k":"ordenes, contratos, papeleria, credito"},
{"c":"LT2795","n":"HOJA DE RESUMEN ESP PQT 25","f":"Hoja de resumen en español, paquete de 25","g":"Ordenes de Compra","k":"ordenes, contratos, papeleria, credito"},
{"c":"LT2797","n":"HOJA DE RESUMEN ING PQT 25","f":"Hoja de resumen en inglés, paquete de 25","g":"Ordenes de Compra","k":"ordenes, contratos, papeleria, credito"},
{"c":"RP0001","n":"ANILLO TUERCA BLANCO P/GRIFO FP5K/6K","f":"Anillo de tuerca blanco para grifo de Frescasure 5000/6000","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"RP0003","n":"PERILLA TAPA VIDRIO EASY RELEASE","f":"Perilla de tapa de vidrio de Easy Release","g":"Partes de Reemplazo","k":"antiadherente, easy release, repuesto, refaccion, parte, mango, agarradera, handle, tapa, tapadera"},
{"c":"RP0004","n":"DER ARO PARA TAPA DE VIDRIO 20CM","f":"Aro para tapa de vidrio de 20 cm","g":"Partes de Reemplazo","k":"efecto piedra, antiadherente, repuesto, refaccion, parte, empaque, sello, silicon, tapa, tapadera"},
{"c":"RP0006","n":"DER ARO PARA TAPA DE VIDRIO 30CM","f":"Aro de Easy Release para tapa de vidrio de 30 cm","g":"Partes de Reemplazo","k":"efecto piedra, antiadherente, repuesto, refaccion, parte, empaque, sello, silicon, tapa, tapadera"},
{"c":"RP0007","n":"SPACER 7/8\" FAUCET","f":"Espaciador para grifo de 7/8 pulgadas","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte"},
{"c":"RP0012","n":"ESPUMADOR DE LECHE BARISTART KIT","f":"Espumador de leche del kit Baristart","g":"Partes de Reemplazo","k":"cafetera, cafe, capuchino, espumador, leche espumada, barista, repuesto, refaccion, parte"},
{"c":"RP0023","n":"RP ELITE EMPAQUE SILICONA 22CM","f":"","g":"Partes de Reemplazo","k":"elite, linea elite, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"RP0024","n":"RP ELITE EMPAQUE SILICONA 26CM","f":"","g":"Partes de Reemplazo","k":"elite, linea elite, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"RP0026","n":"RP ELITE VALVULA REDI-TEMP","f":"","g":"Partes de Reemplazo","k":"elite, linea elite, repuesto, refaccion, parte, valvula, silbato"},
{"c":"RP0042","n":"RP BASE DE MOTOR POWER BLENDER MAX","f":"Base de motor Power Blender Max Royal Prestige","g":"Partes de Reemplazo","k":"licuadora, blender, licuadora grande, efecto piedra, antiadherente, repuesto, refaccion, parte"},
{"c":"RP0160","n":"3 ADAPTADORES PARA FILTRO DE AGUA","f":"3 adaptadores para filtro de agua","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte"},
{"c":"RP1257","n":"RP VALVULA PARA EXPERTEA","f":"Válvula Royal Prestige para Expertea","g":"Partes de Reemplazo","k":"tetera, te, infusor, tea, repuesto, refaccion, parte, valvula, silbato"},
{"c":"RP1258","n":"RP TAPA EXPERTEA","f":"Tapa Expertea Royal Prestige","g":"Partes de Reemplazo","k":"tetera, te, infusor, tea, repuesto, refaccion, parte, tapa, tapadera"},
{"c":"RP1259","n":"RP EXPERTEA MANIJA Y BASE","f":"Manija y base Royal Prestige Expertea","g":"Partes de Reemplazo","k":"tetera, te, infusor, tea, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP1263","n":"RP TAZA INFUSORA EXPERTEA","f":"Taza infusora Royal Prestige Expertea","g":"Partes de Reemplazo","k":"tetera, te, infusor, tea, tazas, termo, cafe, repuesto, refaccion, parte"},
{"c":"RP1350","n":"MANGUERA DE SALIDA P/PREFILTRO 10\"","f":"Manguera de salida para prefiltro de 10 pulgadas","g":"Partes de Reemplazo","k":"repuesto filtro, cartucho, filtro de agua, repuesto, refaccion, parte, manguera"},
{"c":"RP1670","n":"ANILLO O GRANDE P/FILTRO DE DUCHA","f":"Anillo \"O\" grande para filtro de ducha","g":"Partes de Reemplazo","k":"filtro de ducha, regadera, shower, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"RP1902","n":"AGARRADERA LARGA COMPLETA 7CPS","f":"Agarradera larga completa de 7 capas","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP1903","n":"NUEVA AGARRADERA COMPLETA 7 CAPAS","f":"Nueva agarradera completa de 7 capas","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP2224","n":"PB GO CHOPPER ATTACHMENT (PICADORA)","f":"","g":"Partes de Reemplazo","k":"batidor, licuadora portatil, mini licuadora, inmersion, repuesto, refaccion, parte"},
{"c":"RP2225","n":"PB GO BLENDING CUP (VASO)","f":"","g":"Partes de Reemplazo","k":"batidor, licuadora portatil, mini licuadora, inmersion, repuesto, refaccion, parte"},
{"c":"RP2229","n":"PB GO CHOPPER LID (TAPA PICADORA)","f":"","g":"Partes de Reemplazo","k":"batidor, licuadora portatil, mini licuadora, inmersion, repuesto, refaccion, parte, tapa, tapadera"},
{"c":"RP2230","n":"PB GO CHOPPER CONTAINER (RECIPIENTE)","f":"","g":"Partes de Reemplazo","k":"batidor, licuadora portatil, mini licuadora, inmersion, tuppers, contenedores, guardar comida, repuesto, refaccion, parte"},
{"c":"RP2231","n":"PB GO CHOPPER BLADE (CUCHILLA)","f":"","g":"Partes de Reemplazo","k":"batidor, licuadora portatil, mini licuadora, inmersion, repuesto, refaccion, parte"},
{"c":"RP2285","n":"VALVULA NUEVA RP OLLA DE PRESION","f":"Válvula de nueva olla de presión Royal Prestige","g":"Partes de Reemplazo","k":"olla express, pressure cooker, olla pitadora, presion, olla, cocinar, pot, repuesto, refaccion, parte, valvula, silbato"},
{"c":"RP2286","n":"RP MANGO NUEVA RP OLLA DE PRESION","f":"Mango Royal Prestige de nueva olla de presión","g":"Partes de Reemplazo","k":"olla express, pressure cooker, olla pitadora, presion, olla, cocinar, pot, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP2287","n":"ARO DE SILICONA NUEVA RP OLLA PRESION","f":"Aro de silicona de nueva olla de presión Royal Prestige","g":"Partes de Reemplazo","k":"olla express, pressure cooker, olla pitadora, presion, olla, cocinar, pot, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"RP2288","n":"RP CUBIERTA INDICADOR OLLA PRESION","f":"Cubierta de indicador Royal Prestige para olla de presión","g":"Partes de Reemplazo","k":"olla express, pressure cooker, olla pitadora, presion, olla, cocinar, pot, repuesto, refaccion, parte"},
{"c":"RP2289","n":"FILTRO VAPOR/TAPA OLLA PRESION","f":"Filtro de vapor para tapa de olla de presión","g":"Partes de Reemplazo","k":"olla express, pressure cooker, olla pitadora, presion, olla, cocinar, pot, repuesto, refaccion, parte, tapa, tapadera"},
{"c":"RP2290","n":"TUERCA APRIETE CUBIERTA DE CIERRE","f":"Tuerca de apriete para cubierta de cierre","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte"},
{"c":"RP2551","n":"RP SMART TEMP SILICONE HANDLE","f":"","g":"Partes de Reemplazo","k":"indicador de temperatura, termometro, sensor, repuesto, refaccion, parte"},
{"c":"RP3265","n":"ARO DE 38CM INNOVE ROJO","f":"Aro de 38 cm Innové, color rojo","g":"Partes de Reemplazo","k":"innove, linea innove, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"RP3271","n":"AGARRADERA SUPERIOR INNOVE P/ARO MEDIANO","f":"Agarradera superior Innové para aro mediano","g":"Partes de Reemplazo","k":"innove, linea innove, repuesto, refaccion, parte, mango, agarradera, handle, empaque, sello, silicon"},
{"c":"RP3272","n":"AGARRADERA SUPERIOR INNOVE P/ARO GRANDE","f":"Agarradera superior Innové para aro grande","g":"Partes de Reemplazo","k":"innove, linea innove, repuesto, refaccion, parte, mango, agarradera, handle, empaque, sello, silicon"},
{"c":"RP3320","n":"PUREAMBIENCE II - CONTROL REMOTO","f":"Control remoto Pure Ambience II","g":"Partes de Reemplazo","k":"purificador de aire, aire, repuesto, refaccion, parte"},
{"c":"RP3337","n":"PRESIONADOR POWER BLENDER RP","f":"","g":"Partes de Reemplazo","k":"licuadora, blender, efecto piedra, antiadherente, repuesto, refaccion, parte"},
{"c":"RP3338","n":"RP POWER BLENDER BASE PAD SILICONA","f":"","g":"Partes de Reemplazo","k":"licuadora, blender, efecto piedra, antiadherente, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"RP3406","n":"JARRA DE VIDRIO P/LICUADORA PB MAX","f":"Jarra de vidrio para licuadora Power Blender Max","g":"Partes de Reemplazo","k":"licuadora, blender, licuadora grande, repuesto, refaccion, parte"},
{"c":"RP3410","n":"TAPON PLASTICO P/TAPA PB MAX","f":"Tapón de plástico para tapa de Power Blender Max","g":"Partes de Reemplazo","k":"licuadora, blender, licuadora grande, repuesto, refaccion, parte, tapa, tapadera"},
{"c":"RP3411","n":"TAPA DE LA JARRA POWER BLENDER MAX","f":"Tapa de jarra para Power Blender Max","g":"Partes de Reemplazo","k":"licuadora, blender, licuadora grande, efecto piedra, antiadherente, repuesto, refaccion, parte, tapa, tapadera"},
{"c":"RP3412","n":"ARO DE SILICONA P/TAPA PB MAX","f":"Aro de silicona para tapa de Power Blender Max","g":"Partes de Reemplazo","k":"licuadora, blender, licuadora grande, repuesto, refaccion, parte, empaque, sello, silicon, tapa, tapadera"},
{"c":"RP3413","n":"PRESIONADOR JARRA DE VIDRIO PB MAX","f":"Presionador de jarra de vidrio Power Blender Max","g":"Partes de Reemplazo","k":"licuadora, blender, licuadora grande, repuesto, refaccion, parte"},
{"c":"RP3414","n":"PRESIONADOR JARRA DE TRITAN PB MAX","f":"Presionador de jarra de Tritan Power Blender Max","g":"Partes de Reemplazo","k":"licuadora, blender, licuadora grande, repuesto, refaccion, parte"},
{"c":"RP3415","n":"BASE SILICONA LICUADORA PB MAX","f":"Base de silicona para licuadora Power Blender Max","g":"Partes de Reemplazo","k":"licuadora, blender, licuadora grande, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"RP3417","n":"ARO DE SILICONA/ASPAS/VIDRIO PB MAX","f":"Aro de silicona para aspas de vidrio de Power Blender Max","g":"Partes de Reemplazo","k":"licuadora, blender, licuadora grande, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"RP3419","n":"MECANISMO DE ASPAS Y TAPA P/RP MAX","f":"Mecanismo de aspas y tapa para Royal Prestige Max","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte, tapa, tapadera"},
{"c":"RP3420","n":"TAPA PARA MAX CUP","f":"Tapa para Max Cup","g":"Partes de Reemplazo","k":"vaso licuadora, licuadora personal, smoothie, repuesto, refaccion, parte, tapa, tapadera"},
{"c":"RP3421","n":"ROYAL PRESTIGE MAX CUP JARRA SOLA","f":"Jarra Max Cup Royal Prestige sola","g":"Partes de Reemplazo","k":"vaso licuadora, licuadora personal, smoothie, repuesto, refaccion, parte"},
{"c":"RP3422","n":"ADAPTADOR COMPLETO FRESH MAX","f":"Adaptador completo Fresh Max","g":"Partes de Reemplazo","k":"sellado al vacio, bomba de vacio, conservar alimentos, repuesto, refaccion, parte"},
{"c":"RP3426","n":"PB MAX MECANISMO CUCHILLA JARRA VIDRIO","f":"Mecanismo de cuchilla para jarra de vidrio de Power Blender Max","g":"Partes de Reemplazo","k":"licuadora, blender, licuadora grande, repuesto, refaccion, parte"},
{"c":"RP3428","n":"RP MECANISMO COMPLETO CUCHILLA MAX CUP","f":"Mecanismo completo de cuchilla para Max Cup Royal Prestige","g":"Partes de Reemplazo","k":"vaso licuadora, licuadora personal, smoothie, repuesto, refaccion, parte"},
{"c":"RP3459","n":"GASKET PARA CUCHILLA MAX CUP","f":"Junta para cuchilla de Max Cup","g":"Partes de Reemplazo","k":"vaso licuadora, licuadora personal, smoothie, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"RP3600","n":"TOLVA DEL MAXTRACTOR","f":"Tolva del Maxtractor","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, repuesto, refaccion, parte"},
{"c":"RP3601","n":"ULTRA SQUEEZER DEL MAXTRACTOR","f":"Ultra Squeezer del Maxtractor","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, repuesto, refaccion, parte"},
{"c":"RP3602","n":"COLADOR DEL MAXTRACTOR","f":"Colador del Maxtractor","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, colador, escurridor, strainer, repuesto, refaccion, parte"},
{"c":"RP3603","n":"UNIDAD GIRATORIA DEL MAXTRACTOR","f":"Unidad giratoria del Maxtractor","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, repuesto, refaccion, parte"},
{"c":"RP3604","n":"TAZON DEL MAXTRACTOR","f":"Tazón del Maxtractor","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, bowl, tazon, mezclar, batir, repuesto, refaccion, parte"},
{"c":"RP3605","n":"PRESIONADOR DEL MAXTRACTOR","f":"Presionador del Maxtractor","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, repuesto, refaccion, parte"},
{"c":"RP3606","n":"RECIPIENTE JUGO C/MANIJA MAXTRACTOR/RP JUICER","f":"Recipiente para jugo con manija del Maxtractor/extractor de jugos Royal Prestige","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, tuppers, contenedores, guardar comida, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP3607","n":"RECIPIENTE PULPA S/MANIJA MAX/RP JUICER","f":"Recipiente para pulpa sin manija del Maxtractor/extractor de jugos Royal Prestige","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, tuppers, contenedores, guardar comida, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP3608","n":"CEPILLO PARA LIMPIAR MAXTRACTOR/RP JUICER","f":"Cepillo para limpiar material del extractor de jugos Royal Prestige","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, repuesto, refaccion, parte"},
{"c":"RP3609","n":"MAXTRACTOR TAPON DE SILICONA","f":"Tapón de silicona del Maxtractor","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"RP3610","n":"MOTOR (BASE) MAXTRACTOR/RP JUICER","f":"Motor (base) del Maxtractor/extractor de jugos Royal Prestige","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, repuesto, refaccion, parte"},
{"c":"RP3611","n":"TAPA INTELIGENTE DEL MAXTRACTOR","f":"Tapa inteligente del Maxtractor","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, repuesto, refaccion, parte, tapa, tapadera"},
{"c":"RP3617","n":"PIEZA PARA LIMPIAR MAXTRACTOR/RP JUICER","f":"Pieza para limpiar Maxtractor/extractor de jugos Royal Prestige","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, repuesto, refaccion, parte"},
{"c":"RP3628","n":"TOLVA ENSAMBLE P/EXTRACTOR DE JUGOS RP","f":"Tolva ensamblada para extractor de jugos Royal Prestige","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, repuesto, refaccion, parte"},
{"c":"RP3629","n":"RP EXTRACTOR JUGOS ULTRASQUEEZER","f":"Extractor de jugos Royal Prestige Ultra Squeezer","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, repuesto, refaccion, parte"},
{"c":"RP3630","n":"COLADOR PARA EXTRACTOR DE JUGOS RP","f":"Colador para extractor de jugos Royal Prestige","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, colador, escurridor, strainer, repuesto, refaccion, parte"},
{"c":"RP3631","n":"UNIDAD GIRATORIA P/EXTRACTOR JUGOS RP","f":"Unidad giratoria para extractor de jugos Royal Prestige","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, repuesto, refaccion, parte"},
{"c":"RP3632","n":"TAZON DEL EXTRACTOR DE JUGOS RP","f":"Tazón del extractor de jugos Royal Prestige","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, bowl, tazon, mezclar, batir, repuesto, refaccion, parte"},
{"c":"RP3633","n":"UTENSILIO P/PRESIONAR EXTRACTOR JUGOS RP","f":"Utensilio para presionar del extractor de jugos Royal Prestige","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, repuesto, refaccion, parte"},
{"c":"RP3636","n":"TAPA INTELIGENTE P/EXTRACTOR JUGOS RP","f":"Tapa inteligente para extractor de jugos Royal Prestige","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, repuesto, refaccion, parte, tapa, tapadera"},
{"c":"RP3637","n":"EMPAQUE P/COLADOR EXTRACTOR JUGOS RP","f":"Empaque para colador de extractor de jugos Royal Prestige","g":"Partes de Reemplazo","k":"extractor, juguera, jugos, juicer, colador, escurridor, strainer, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"RP4410","n":"VALVULA COMPLETA PARA 5Y9 CAPAS","f":"Válvula completa para 5 y 9 capas","g":"Partes de Reemplazo","k":"9 capas, repuesto, refaccion, parte, valvula, silbato"},
{"c":"RP4420","n":"MANGO LATERAL COLADOR JR 4CTS 5CPS","f":"Mango lateral de colador Junior de 4 cuartos y 5 capas","g":"Partes de Reemplazo","k":"colador, escurridor, strainer, 5 capas, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4425","n":"MANGO LATERAL SARTEN 10\" 6Y8 CTS 5C","f":"Mango lateral para sartén de 10 pulgadas o 6 y 8 cuartos de 5 capas","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4430","n":"AGARRADERA CORTA 3&4QT/SARTEN 8\" 9CPS","f":"Agarradera corta para ollas de 3 y 4 cuartos o sartén de 8 a 9 capas","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, 9 capas, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4435","n":"MANGO SARTEN 10\" 6Y8 QTS Y ALTA","f":"Mango de sartén de 10 pulgadas, 6 y 8 cuartos y alta","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4440","n":"AGARRADERA CORTA P/12QT 9 CAPAS","f":"Agarradera corta para olla de 12 cuartos de 9 capas","g":"Partes de Reemplazo","k":"9 capas, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4445","n":"ASA OLLA 20QT/PAELLA 14\" 5&9 CAPAS","f":"Asa para olla de 20 cuartos o paellera de 14 pulgadas de 5 y 9 capas","g":"Partes de Reemplazo","k":"paella, sarten hondo, arrocera, tamalera, olla grande, vaporera, tamales, olla, cocinar, pot, 9 capas, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4450","n":"AGARRADERA CORTA P/30QT 9 CAPAS","f":"Agarradera corta para olla de 30 cuartos de 9 capas","g":"Partes de Reemplazo","k":"9 capas, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4454","n":"AGARRADERA P/TAPA-BANDEJA P/ASAR ACERO","f":"Agarradera para tapa de bandeja de acero para asar","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte, mango, agarradera, handle, tapa, tapadera"},
{"c":"RP4457","n":"MANGO HERVIDOR 1QT 5 CAPAS NUEVO","f":"Mango de hervidor de 1 cuarto y 5 capas, nuevo","g":"Partes de Reemplazo","k":"tetera, pava, hervir agua, kettle, 5 capas, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4458","n":"VALVULA COMPLETA COLOR NEGRO RP","f":"Válvula completa Royal Prestige de color negro","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte, valvula, silbato"},
{"c":"RP4462","n":"MANGO P/SARTEN GOURMET DE 8\"/20CM","f":"Mango para sartén Gourmet de 8 pulgadas o 20 cm","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, gourmet, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4463","n":"MANGO P/SARTEN GOURMET DE 10\"/24CM","f":"Agarradera Royal Prestige de olla de 4 cuartos y sartén","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, gourmet, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4464","n":"MANGO P/SARTEN GOURMET DE 12\"/30CM","f":"","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, gourmet, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4475","n":"AGARRADERA LARGA 1.5&2QT 9CPS","f":"Agarradera larga para ollas de 1.5 y 2 cuartos de 9 capas","g":"Partes de Reemplazo","k":"9 capas, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4480","n":"AGARRADERA LARGA SARTEN 8\" 9CPS","f":"Agarradera larga para sartén de 8 a 9 capas","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, 9 capas, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4485","n":"AGARRADERA LARGA SARTEN 10\" 9CPS","f":"Agarradera larga para sartén de 10 pulgadas de 9 capas","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, 9 capas, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4572","n":"JUNTA/MONTAJE DE LA TAPA FP3000","f":"Junta y montaje de la tapa para Frescasure 3000","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte, empaque, sello, silicon, tapa, tapadera"},
{"c":"RP4576","n":"MONTAJE/CUBIERTA FP3000 BLANCO","f":"Montaje/cubierta para Frescasure 3000, color blanco","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte"},
{"c":"RP4600","n":"CUBIERTA SUPERIOR FRESCAPURE/DUCHA","f":"Cubierta superior para Frescasure/ducha","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, filtro de ducha, regadera, shower, repuesto, refaccion, parte"},
{"c":"RP4615","n":"CONEXION GIRATORIA FP PARA LA DUCHA","f":"Conexión giratoria de Frescasure para la ducha","g":"Partes de Reemplazo","k":"filtro de ducha, regadera, shower, repuesto, refaccion, parte"},
{"c":"RP4620","n":"MANGUERA FRESCAPURE/DUCHA","f":"Manguera para Frescasure/ducha","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, filtro de ducha, regadera, shower, repuesto, refaccion, parte, manguera"},
{"c":"RP4622","n":"POSTE SUPERIOR DUCHA FRESCAPURE","f":"Poste superior de ducha Frescasure","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, filtro de ducha, regadera, shower, repuesto, refaccion, parte"},
{"c":"RP4650","n":"AGARRADERA COMPLETA P/TAPA RP","f":"Agarradera completa para tapa Royal Prestige","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte, mango, agarradera, handle, tapa, tapadera"},
{"c":"RP4652","n":"MANGO LATERAL COLADOR JR 4CTS NOVEL","f":"Mango lateral de colador Junior de 4 cuartos Novel","g":"Partes de Reemplazo","k":"colador, escurridor, strainer, novel, linea novel, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4654","n":"MANGO LATERAL SARTEN 10\" 6Y8 CTS NOVEL","f":"Mango lateral para sartén de 10 pulgadas, 6 y 8 cuartos Novel","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, novel, linea novel, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4656","n":"AGARRADERA CORTA PARA 12QT RP","f":"Agarradera corta para olla de 12 cuartos Royal Prestige","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4658","n":"MANGO LATERAL PAELLERA 20CTS RP","f":"Mango lateral para paellera de 20 cuartos Royal Prestige","g":"Partes de Reemplazo","k":"paella, sarten hondo, arrocera, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4662","n":"AGARRADERA LATERAL PLANCHA DOBLE 18\"X10\" RP","f":"Agarradera lateral para plancha doble Royal Prestige de 18 x 10 pulgadas","g":"Partes de Reemplazo","k":"comal, comal doble, budare, griddle, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4664","n":"AGARRADERA LATERAL PARRILLA REDONDA 12\"/30\" RP","f":"Agarradera lateral para parrilla redonda Royal Prestige de 12 pulgadas o 30 cm","g":"Partes de Reemplazo","k":"comal redondo, grill, asador, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4670","n":"AGARRADERA LARGA 1.5CT Y 2CTS NOVEL","f":"Agarradera larga para ollas de 1.5 y 2 cuartos Novel","g":"Partes de Reemplazo","k":"novel, linea novel, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4672","n":"MANGO PLANCHA SENCILLA 11\"/25CM RP","f":"Mango para plancha sencilla Royal Prestige de 11 pulgadas o 25 cm","g":"Partes de Reemplazo","k":"comal, comal sencillo, budare, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4676","n":"MANGO P/SARTEN GOURMET 10\"/24CM NOVEL","f":"Mango para sartén Gourmet de 10 pulgadas o 24 cm Novel","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, novel, linea novel, gourmet, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4680","n":"AGARRADERA LARGA 3QT Y SARTEN 8\" NOVEL","f":"Agarradera larga para olla de 3 cuartos y sartén de 8 pulgadas Novel","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, novel, linea novel, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4682","n":"AGARRADERA LARGA SARTEN 10\" 5CPS NOVEL","f":"Agarradera larga para sartén de 10 pulgadas de 5 capas Novel","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, novel, linea novel, 5 capas, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4777","n":"SURTIDOR ENERGIA CON ADAPTADOR BAJO MOSTRADOR","f":"","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte"},
{"c":"RP4800","n":"AGARRADERA MEDIANA PARA TAPA INNOVE","f":"Agarradera mediana para tapa Innové","g":"Partes de Reemplazo","k":"innove, linea innove, repuesto, refaccion, parte, mango, agarradera, handle, tapa, tapadera"},
{"c":"RP4801","n":"AGARRADERA GRANDE PARA TAPA INNOVE","f":"Agarradera grande para tapa Innové","g":"Partes de Reemplazo","k":"innove, linea innove, repuesto, refaccion, parte, mango, agarradera, handle, tapa, tapadera"},
{"c":"RP4802","n":"ROYAL PRESTIGE VALVULA","f":"Válvula Royal Prestige","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte, valvula, silbato"},
{"c":"RP4807","n":"AGARRADERA INNOVE C/SILICON TAPA 20CM","f":"Agarradera Innové con silicona para tapa de 20 cm","g":"Partes de Reemplazo","k":"innove, linea innove, repuesto, refaccion, parte, mango, agarradera, handle, tapa, tapadera"},
{"c":"RP4808","n":"AGARRADERA INNOVE C/SILICON TAPA 24/30CM","f":"Agarradera Innové con silicona para tapa de 24 o 30 cm","g":"Partes de Reemplazo","k":"innove, linea innove, repuesto, refaccion, parte, mango, agarradera, handle, tapa, tapadera"},
{"c":"RP4810","n":"ASA LATERAL DESMONTABLE INNOVE","f":"Asa lateral desmontable Innové","g":"Partes de Reemplazo","k":"innove, linea innove, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4811","n":"ASA LARGA DESMONTABLE INNOVE","f":"Asa larga desmontable Innové","g":"Partes de Reemplazo","k":"innove, linea innove, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4814","n":"AGARRADERA SUPERIOR TAPA INNOVE 63CT","f":"Agarradera superior para tapa Innové 63CT","g":"Partes de Reemplazo","k":"innove, linea innove, repuesto, refaccion, parte, mango, agarradera, handle, tapa, tapadera"},
{"c":"RP4815","n":"RESORTE PARA ASA LATERAL INNOVE","f":"Resorte para asa lateral Innové","g":"Partes de Reemplazo","k":"innove, linea innove, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4840","n":"RP MULTIPAN PERILLA DE SILBATO","f":"Perilla de silbato para el multiguisado Royal Prestige","g":"Partes de Reemplazo","k":"olla multiusos, vaporera, silbato, multiuso, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4842","n":"RP MULTIPAN AGARRADERA CORTA","f":"Agarradera corta para el multiguisado Royal Prestige","g":"Partes de Reemplazo","k":"olla multiusos, vaporera, silbato, multiuso, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4843","n":"RP MULTIPAN MANGO LARGO","f":"Mango largo para el multiguisado Royal Prestige","g":"Partes de Reemplazo","k":"olla multiusos, vaporera, silbato, multiuso, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4846","n":"RP MULTIPAN EMPAQUE SOLO","f":"Empaque solo para el multiguisado Royal Prestige","g":"Partes de Reemplazo","k":"olla multiusos, vaporera, silbato, multiuso, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"RP4848","n":"RP MULTIPAN EMPAQUE DE COLADOR","f":"Empaque de colador para el multiguisado Royal Prestige","g":"Partes de Reemplazo","k":"olla multiusos, vaporera, silbato, multiuso, colador, escurridor, strainer, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"RP4900","n":"ASA RP TAPA 16CM+20CM+SARTEN GOURMET 8\"","f":"Asa Royal Prestige para tapas de 16 y 20 cm y sartén Gourmet de 8 pulgadas","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, gourmet, repuesto, refaccion, parte, mango, agarradera, handle, tapa, tapadera"},
{"c":"RP4903","n":"MANGO RP PARA OLLA DE 1.5QT Y 2QT","f":"Mango Royal Prestige para olla de 1.5 y 2 cuartos","g":"Partes de Reemplazo","k":"olla, cocinar, pot, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4904","n":"MANGO RP DE OLLA 3QT Y SARTEN 8\"","f":"Mango Royal Prestige de olla de 3 cuartos y sartén de 8 pulgadas","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, olla, cocinar, pot, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4905","n":"AGARRADERA RP DE OLLA 4QT Y SARTEN 8\"","f":"Mango para sartén Gourmet de 10 pulgadas o 24 cm","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, olla, cocinar, pot, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4906","n":"MANGO RP DE SARTEN 10.5\"/26CM","f":"Mango Royal Prestige para sartén de 10.5 pulgadas o 26 cm","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4907","n":"ASA DE OLLAS 6QT/8QT Y SARTEN 10.5\"","f":"Asa para ollas de 6 y 8 cuartos y sartén de 10.5 pulgadas","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4908","n":"AGARRADERA RP PARA PAELLERA 14\"","f":"Agarradera Royal Prestige para paellera de 14 pulgadas","g":"Partes de Reemplazo","k":"paella, sarten hondo, arrocera, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4909","n":"MANGO RP PARA SARTEN GOURMET DE 8\"","f":"","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, gourmet, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4910","n":"MANGO RP PARA SARTEN GOURMET DE 10\"","f":"","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, gourmet, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4913","n":"AGARRADERA RP PARA COLADOR DE 20CM","f":"Agarradera Royal Prestige para colador de 20 cm","g":"Partes de Reemplazo","k":"colador, escurridor, strainer, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4914","n":"AGARRADERA RP PARA TAPA ALTA 26CM","f":"Agarradera Royal Prestige para tapa alta de 26 cm","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte, mango, agarradera, handle, tapa, tapadera"},
{"c":"RP4920","n":"AGARRADERA RP PARA COLADOR DE 26CM","f":"Agarradera Royal Prestige para colador de 26 cm","g":"Partes de Reemplazo","k":"colador, escurridor, strainer, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP4921","n":"AGARRADERA RP PARA PAELLERA DE 10\"","f":"Agarradera Royal Prestige para paellera de 10 pulgadas","g":"Partes de Reemplazo","k":"paella, sarten hondo, arrocera, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP5405","n":"AGARRADERA COMPLETA P/TAPA 5-9 CPS","f":"Agarradera completa para tapa de 5 a 9 capas","g":"Partes de Reemplazo","k":"9 capas, repuesto, refaccion, parte, mango, agarradera, handle, tapa, tapadera"},
{"c":"RP5455","n":"MANGO DEL HERVIDOR DE 1/2QT 5 CAPAS","f":"Mango de hervidor de 1/2 cuarto y 5 capas","g":"Partes de Reemplazo","k":"tetera, pava, hervir agua, kettle, 5 capas, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP5460","n":"AGARRADERA LARGA 1.5CT Y 2CTS 5 CAPAS","f":"Agarradera larga para ollas de 1.5 y 2 cuartos de 5 capas","g":"Partes de Reemplazo","k":"5 capas, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP5465","n":"AGARRADERA LARGA 3QT&SARTEN 8\" 5CPS","f":"Agarradera larga para olla de 3 cuartos y sartén de 8 pulgadas de 5 capas","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, 5 capas, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP5470","n":"STICK HANDLE 10\" SKILLET 5 PLY","f":"","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, 5 capas, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP5610","n":"MANGO - FRESCAPURE PARA LA DUCHA","f":"Mango Frescasure para la ducha","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, filtro de ducha, regadera, shower, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP6150","n":"TAPA P/CUBIERTA FP5500-6000 SOBRE MOSTRADOR","f":"Tapa para cubierta de Frescasure 5500/6000 de mostrador","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte, tapa, tapadera"},
{"c":"RP6153","n":"EMPAQUE DEL TANQUE FRESCAPURE 6000","f":"Empaque del tanque para Frescasure 6000","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"RP6154","n":"ABRAZADERA DEL TANQUE DEL FP6000","f":"Abrazadera del tanque del Frescasure 6000","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte"},
{"c":"RP6155","n":"TANQUE DE ACERO INOXIDABLE FP6000","f":"Tanque de acero inoxidable para Frescasure 6000","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte"},
{"c":"RP6157","n":"COLLAR DE LIBERACION DEL FP6000","f":"Collar de liberación del Frescasure 6000","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte"},
{"c":"RP6158","n":"TAPA BATERIA FP6000 SOBRE MOSTRADOR","f":"Tapa de batería para Frescasure 6000 de mostrador","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte, tapa, tapadera"},
{"c":"RP6159","n":"MONITOR DE FLUJO FP5500/FP6000","f":"Monitor de flujo Frescasure 5500/6000","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte"},
{"c":"RP6161","n":"JUEGO DEL GRIFO FP6000","f":"Juego del grifo Frescasure 6000","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte"},
{"c":"RP6163","n":"CUBIERTA INFERIOR FP5500 SOBRE MOSTRADOR","f":"Cubierta inferior de Frescasure 5500 de mostrador","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte"},
{"c":"RP6164","n":"BASE DEL FP5500 BAJO MOSTRADOR","f":"Base del Frescasure 5500 para debajo del mostrador","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte"},
{"c":"RP6165","n":"MONITOR LED PARA LLAVE DE 3 MANGUERAS","f":"Anillo LED del Frescapure 5500 bajo mostrador","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte, manguera, fp5500, frescapure, led, bajo, mostrador"},
{"c":"RP6166","n":"NUEVA TAPA-CUBIERTA FP5500/FP6000","f":"Nueva tapa/cubierta para Frescasure 5500/6000","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte, tapa, tapadera"},
{"c":"RP6171","n":"MANGUERA AZUL DE 8\" FP5500/FP6000","f":"Manguera azul de 8 pulgadas para Frescasure 5500/6000","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte, manguera"},
{"c":"RP6172","n":"MANGUERA ROJA DE 12\" FP5500/FP6000","f":"Manguera roja de 12 pulgadas para Frescasure 5500/6000","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte, manguera"},
{"c":"RP6174","n":"BASE FP6000 DEBAJO DE MOSTRADOR S/LOGO","f":"Base de Frescasure 6000 para debajo del mostrador sin logo","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte"},
{"c":"RP6192","n":"EMPAQUE DEL TANQUE FP3500","f":"Empaque del tanque para Frescasure 3500","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"RP7162","n":"FP5500 UC VALVULA-T","f":"","g":"Partes de Reemplazo","k":"filtro de agua, purificador, agua, repuesto, refaccion, parte, valvula, silbato"},
{"c":"RP9700","n":"MANGO LARGO SARTEN 20CM EASY RELEASE","f":"Mango largo de sartén de 20 cm Easy Release","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, antiadherente, easy release, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP9701","n":"MANGO LATERAL SARTEN 30CM EASY RELEASE","f":"Mango lateral de sartén de 30 cm Easy Release","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, antiadherente, easy release, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP9702","n":"MANGO LARGO SARTEN 26CM EASY RELEASE","f":"Mango largo de sartén de 26 cm Easy Release","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, antiadherente, easy release, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP9703","n":"MANGO LARGO SARTEN 30CM EASY RELEASE","f":"Mango largo de sartén de 30 cm Easy Release","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, antiadherente, easy release, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP9712","n":"AGARRADERA VALVULA VIDRIO EASY RELEASE","f":"Agarradera con válvula de vidrio Easy Release","g":"Partes de Reemplazo","k":"antiadherente, easy release, repuesto, refaccion, parte, mango, agarradera, handle, valvula, silbato"},
{"c":"RP9713","n":"ARO SILICONA TAPA DE VIDRIO ER 18CM","f":"Aro de silicona para tapa de vidrio de Easy Release de 18 cm","g":"Partes de Reemplazo","k":"antiadherente, easy release, repuesto, refaccion, parte, empaque, sello, silicon, tapa, tapadera"},
{"c":"RP9714","n":"ARO SILICONA TAPA DE VIDRIO ER 20CM","f":"Aro de silicona para tapa de vidrio de Easy Release de 20 cm","g":"Partes de Reemplazo","k":"antiadherente, easy release, repuesto, refaccion, parte, empaque, sello, silicon, tapa, tapadera"},
{"c":"RP9716","n":"MANGO SARTEN 2QT-1.89L EASY RELEASE","f":"Mango de sartén de 2 cuartos o 1.89 litros Easy Release","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, antiadherente, easy release, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP9717","n":"MANGO SARTEN 3QT-2.84L EASY RELEASE","f":"Mango de sartén de 3 cuartos o 2.84 litros Easy Release","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, antiadherente, easy release, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"RP9719","n":"AGARRADERA SARTEN 3.5Q-3.31L ER","f":"","g":"Partes de Reemplazo","k":"sarten, freir, frying pan, antiadherente, easy release, repuesto, refaccion, parte, mango, agarradera, handle"},
{"c":"SP0420","n":"ARO 16CM Y VENTANA INNOVE ROJO","f":"Aro de 16 cm con ventana Innové, color rojo","g":"Partes de Reemplazo","k":"innove, linea innove, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"SP0430","n":"ARO 20CM Y VENTANA INNOVE ROJO","f":"Aro de 20 cm con ventana Innové, color rojo","g":"Partes de Reemplazo","k":"innove, linea innove, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"SP0440","n":"ARO 26CM Y VENTANA INNOVE ROJO","f":"Aro de 26 cm con ventana Innové, color rojo","g":"Partes de Reemplazo","k":"innove, linea innove, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"SP0450","n":"ARO 30CM Y VENTANA INNOVE ROJO","f":"Aro de 30 cm con ventana Innové, color rojo","g":"Partes de Reemplazo","k":"innove, linea innove, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"SP0460","n":"ARO 35CM Y VENTANA INNOVE ROJO","f":"Aro de 35 cm con ventana Innové, color rojo","g":"Partes de Reemplazo","k":"innove, linea innove, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"SP0470","n":"ARO 38CM Y VENTANA INNOVE ROJO","f":"Aro de 38 cm con ventana Innové, color rojo","g":"Partes de Reemplazo","k":"innove, linea innove, repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"SP0488","n":"ARO PARA TAPA ALTA - ROJO","f":"Aro para tapa alta, color rojo","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte, empaque, sello, silicon, tapa, tapadera"},
{"c":"SP2420","n":"ARO DE 16CM ROJO","f":"Aro de 16 cm, color rojo","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"SP2440","n":"ARO DE 20CM ROJO","f":"Aro de 20 cm, color rojo","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"SP2460","n":"ARO DE 26CM ROJO","f":"Aro de 26 cm, color rojo","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"SP2480","n":"ARO DE 35CM ROJO","f":"Aro de 35 cm, color rojo","g":"Partes de Reemplazo","k":"repuesto, refaccion, parte, empaque, sello, silicon"},
{"c":"CO0101","n":"RP CHOCOLATERA","f":"Chocolatera Royal Prestige","g":"Piezas con Tapa","k":"chocolate caliente, champurrado, olla chocolate"},
{"c":"CO1001","n":"RP EXPERTEA CON RECETARIO","f":"Royal Prestige Expertea","g":"Piezas con Tapa","k":"tetera, te, infusor, tea, recetario, recetas"},
{"c":"CO1453","n":"OLLA DE PRESION RP 6L & RECETARIO","f":"Olla de presión Royal Prestige de 6 litros con recetario","g":"Piezas con Tapa","k":"olla express, pressure cooker, olla pitadora, presion, olla, cocinar, pot, recetario, recetas, vaporera"},
{"c":"CO1458","n":"OLLA DE PRESION RP 10L & RECETARIO","f":"Olla de presión Royal Prestige de 10 litros con recetario","g":"Piezas con Tapa","k":"olla express, pressure cooker, olla pitadora, presion, olla, cocinar, pot, recetario, recetas, vaporera"},
{"c":"CO2106","n":"ROYAL PRESTIGE BARISTA","f":"Royal Prestige Barista","g":"Piezas con Tapa","k":"cafetera, cafe, capuchino, espumador"},
{"c":"CO2206","n":"BARISTA/BARISTART KIT","f":"Kit Barista/Baristart","g":"Piezas con Tapa","k":"cafetera, cafe, capuchino, espumador"},
{"c":"CO6130","n":"OLLA DE 1.5 CUARTOS/16CM 5 CAPAS","f":"","g":"Piezas con Tapa","k":"olla, cocinar, pot, 5 capas"},
{"c":"CO6145","n":"OLLA 4 CUARTOS/20CM C/TAPA 5CPS","f":"Olla de 4 cuartos o 20 cm con tapa de 5 capas","g":"Piezas con Tapa","k":"olla, cocinar, pot, 5 capas"},
{"c":"CO6155","n":"OLLA 8 CUARTOS/26CM C/TAPA 5CPS","f":"Olla de 8 cuartos o 26 cm con tapa de 5 capas","g":"Piezas con Tapa","k":"olla, cocinar, pot, 5 capas"},
{"c":"CO6589","n":"PAVERA OVALADA ROYAL PRESTIGE","f":"Pavera ovalada Royal Prestige","g":"Piezas con Tapa","k":"pavo, asador, horno, thanksgiving"},
{"c":"CO8070","n":"PAELLERA DE 14\"/35CM C/TAPA 5CPS","f":"Paellera de 14 pulgadas o 35 cm con tapa de 5 capas","g":"Piezas con Tapa","k":"paella, sarten hondo, arrocera, 5 capas"},
{"c":"CO8072","n":"PAELLERA DE 10\" C/TAPA 5 CAPAS","f":"Paellera de 10 pulgadas con tapa de 5 capas","g":"Piezas con Tapa","k":"paella, sarten hondo, arrocera, 5 capas"},
{"c":"CO8375","n":"OLLA 12 CUARTOS/30CM C/TAPA 9CPS","f":"Olla de 12 cuartos o 30 cm con tapa de 9 capas","g":"Piezas con Tapa","k":"tamalera, olla grande, vaporera, tamales, olla, cocinar, pot, 9 capas"},
{"c":"CO8380","n":"OLLA 20 CUARTOS/35CM C/TAPA 9CPS","f":"Olla de 20 cuartos o 35 cm con tapa de 9 capas","g":"Piezas con Tapa","k":"tamalera, olla grande, vaporera, tamales, olla, cocinar, pot, 9 capas"},
{"c":"CO8385","n":"OLLA 30 CUARTOS/38CM C/TAPA 9CPS","f":"Olla de 30 cuartos o 38 cm con tapa de 9 capas","g":"Piezas con Tapa","k":"tamalera, olla grande, vaporera, tamales, olla, cocinar, pot, 9 capas"},
{"c":"CO8650","n":"SARTEN GOURMET 8\"/20CM C/TAPA (5 CAPAS)","f":"Sartén Gourmet de 8 pulgadas o 20 cm con tapa","g":"Piezas con Tapa","k":"sarten, freir, frying pan, gourmet, 5 capas"},
{"c":"CO8655","n":"SARTEN GOURMET 10\"/25CM C/TAPA (5 CAPAS)","f":"Sartén Gourmet de 10 pulgadas o 25 cm con tapa","g":"Piezas con Tapa","k":"sarten, freir, frying pan, gourmet, 5 capas"},
{"c":"CO8660","n":"SARTEN GOURMET 12\"/30CM C/TAPA (5 CAPAS)","f":"Sartén Gourmet de 12 pulgadas o 30 cm con tapa","g":"Piezas con Tapa","k":"sarten, freir, frying pan, gourmet, 5 capas"},
{"c":"CO9079","n":"OLLA ROYAL PRESTIGE DE 60QT C/TAPA","f":"","g":"Piezas con Tapa","k":"tamalera, olla grande, vaporera, tamales, olla gigante, olla, cocinar, pot"},
{"c":"CO9222","n":"WOK INNOVE 316L CON TAPA","f":"Wok Innové 316L con tapa","g":"Piezas con Tapa","k":"comida china, saltear, stir fry, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9224","n":"OLLA DE 12QT/30CM + TAPA INNOVE 316L","f":"Olla de 12 cuartos o 30 cm con tapa Innové 316L","g":"Piezas con Tapa","k":"tamalera, olla grande, vaporera, tamales, olla, cocinar, pot, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9226","n":"OLLA INNOVE 20QT/35CM 316L CON TAPA","f":"Olla Innové de 20 cuartos o 35 cm 316L con tapa","g":"Piezas con Tapa","k":"tamalera, olla grande, vaporera, tamales, olla, cocinar, pot, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9228","n":"OLLA DE 30QT/38CM INNOVE C/TAPA 316L","f":"Olla de 30 cuartos o 38 cm Innové con tapa 316L","g":"Piezas con Tapa","k":"tamalera, olla grande, vaporera, tamales, olla, cocinar, pot, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9230","n":"SARTEN GOURMET 8\"/20CM + TAPA INNOVE 316L","f":"Sartén Gourmet de 8 pulgadas o 20 cm con tapa Innové 316L","g":"Piezas con Tapa","k":"sarten, freir, frying pan, innove, linea innove, gourmet, 316L, titanio quirurgico"},
{"c":"CO9232","n":"SARTEN GOURMET 10\"/24CM + TAPA INNOVE 316L","f":"Sartén Gourmet de 10 pulgadas o 24 cm con tapa Innové 316L","g":"Piezas con Tapa","k":"sarten, freir, frying pan, innove, linea innove, gourmet, 316L, titanio quirurgico"},
{"c":"CO9234","n":"SARTEN GOURMET 12\"/30CM + TAPA INNOVE 316L","f":"Sartén Gourmet de 12 pulgadas o 30 cm con tapa Innové 316L","g":"Piezas con Tapa","k":"sarten, freir, frying pan, innove, linea innove, gourmet, 316L, titanio quirurgico"},
{"c":"CO9236","n":"OLLA DE 4QT/20CM + TAPA INNOVE 316L","f":"Olla de 4 cuartos o 20 cm con tapa Innové 316L","g":"Piezas con Tapa","k":"olla, cocinar, pot, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9237","n":"OLLA DE 8QT/26CM + TAPA INNOVE 316L","f":"Olla de 8 cuartos o 26 cm con tapa Innové 316L","g":"Piezas con Tapa","k":"olla, cocinar, pot, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9268","n":"OLLA INNOVE 20QT 316L CON PARRILLA","f":"Olla Innové de 20 cuartos 316L con parrilla","g":"Piezas con Tapa","k":"tamalera, olla grande, vaporera, tamales, rejilla, base para tamales, olla, cocinar, pot, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9315","n":"PAELLERA + TAPA 14\"/35CM INNOVE 316L","f":"Paellera de 14 pulgadas o 35 cm con tapa Innové 316L","g":"Piezas con Tapa","k":"paella, sarten hondo, arrocera, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9317","n":"PAELLERA + TAPA 10\"/26CM INNOVE 316L","f":"Paellera de 10 pulgadas o 26 cm con tapa Innové 316L","g":"Piezas con Tapa","k":"paella, sarten hondo, arrocera, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9565","n":"OLLA NOVEL 4QT/20CM CON TAPA","f":"Olla Novel de 4 cuartos o 20 cm con tapa","g":"Piezas con Tapa","k":"olla, cocinar, pot, novel, linea novel"},
{"c":"CO9575","n":"OLLA NOVEL 8QT/26CM CON TAPA","f":"Olla Novel de 8 cuartos o 26 cm con tapa","g":"Piezas con Tapa","k":"olla, cocinar, pot, novel, linea novel"},
{"c":"CO9595","n":"PAELLERA NOVEL 10\" CON TAPA","f":"Paellera Novel de 10 pulgadas con tapa","g":"Piezas con Tapa","k":"paella, sarten hondo, arrocera, novel, linea novel"},
{"c":"CO9598","n":"PAELLERA NOVEL 14\" CON TAPA","f":"Paellera Novel de 14 pulgadas con tapa","g":"Piezas con Tapa","k":"paella, sarten hondo, arrocera, novel, linea novel"},
{"c":"CO9630","n":"SARTEN GOURMET RP 8\"/20CM C/TAPA","f":"Sartén Gourmet Royal Prestige de 8 pulgadas o 20 cm con tapa","g":"Piezas con Tapa","k":"sarten, freir, frying pan, gourmet"},
{"c":"CO9640","n":"SARTEN GOURMET RP 10\"/24CM C/TAPA","f":"Sartén Gourmet Royal Prestige de 10 pulgadas o 24 cm con tapa","g":"Piezas con Tapa","k":"sarten, freir, frying pan, gourmet"},
{"c":"CO9650","n":"SARTEN GOURMET RP 12\"/30CM C/TAPA","f":"Sartén Gourmet Royal Prestige de 12 pulgadas o 30 cm con tapa","g":"Piezas con Tapa","k":"sarten, freir, frying pan, gourmet"},
{"c":"CO9660","n":"OLLA RP DE 12QT/30CM CON TAPA","f":"Olla Royal Prestige de 12 cuartos o 30 cm con tapa","g":"Piezas con Tapa","k":"tamalera, olla grande, vaporera, tamales, olla, cocinar, pot"},
{"c":"CO9675","n":"OLLA RP DE 20QT/35CM CON TAPA","f":"Olla Royal Prestige de 20 cuartos o 35 cm con tapa","g":"Piezas con Tapa","k":"tamalera, olla grande, vaporera, tamales, olla, cocinar, pot"},
{"c":"CO9680","n":"OLLA RP DE 30QT/38CM CON TAPA","f":"Olla Royal Prestige de 30 cuartos o 38 cm con tapa","g":"Piezas con Tapa","k":"tamalera, olla grande, vaporera, tamales, olla, cocinar, pot"},
{"c":"PR2124","n":"CACEROLA ROYAL PRESTIGE","f":"Cacerola Royal Prestige","g":"Piezas con Tapa","k":"olla pequeña, saucepan"},
{"c":"PR2134","n":"KIT COMPLETO BARISTART","f":"Kit completo Baristart","g":"Piezas con Tapa","k":"cafetera, cafe, capuchino, espumador"},
{"c":"PR6100","n":"TAPA OLLA PRESION PROGRAMA UPGRADE","f":"Programa de actualización de tapa individual para olla de presión","g":"Piezas con Tapa","k":"olla express, pressure cooker, olla pitadora, presion, olla, cocinar, pot, vaporera, tapa, lid, upgrade"},
{"c":"CO1651","n":"SARTEN GOURMET 8\"/20CM - 5 CAPAS","f":"Sartén Gourmet de 8 pulgadas o 20 cm de 5 capas","g":"Piezas sin Tapa","k":"sarten, freir, frying pan, gourmet, 5 capas"},
{"c":"CO1663","n":"SARTENES GOURMET 8, 10 Y 12\" - 5CPS","f":"Juego de sartenes Gourmet de 8, 10 y 12 pulgadas de 5 capas","g":"Piezas sin Tapa","k":"sarten, freir, frying pan, gourmet, 5 capas"},
{"c":"CO6135","n":"OLLA DE 2 CUARTOS/16CM - 5 CAPAS","f":"Olla de 2 cuartos o 16 cm de 5 capas","g":"Piezas sin Tapa","k":"olla, cocinar, pot, 5 capas"},
{"c":"CO6140","n":"OLLA DE 3 CUARTOS/20CM - 5 CAPAS","f":"Olla de 3 cuartos o 20 cm de 5 capas","g":"Piezas sin Tapa","k":"olla, cocinar, pot, 5 capas"},
{"c":"CO6150","n":"OLLA 6 CUARTOS/26CM - 5 CAPAS","f":"Olla de 6 cuartos o 26 cm de 5 capas","g":"Piezas sin Tapa","k":"olla, cocinar, pot, 5 capas"},
{"c":"CO6156","n":"OLLA DE 8 CUARTOS/26CM - 5 CAPAS","f":"","g":"Piezas sin Tapa","k":"olla, cocinar, pot, 5 capas"},
{"c":"CO6160","n":"SARTEN 8\"/2 CUARTOS/20CM - 5 CAPAS","f":"Sartén de 8 pulgadas o 2 cuartos o 20 cm de 5 capas","g":"Piezas sin Tapa","k":"sarten, freir, frying pan, 5 capas"},
{"c":"CO6165","n":"SARTEN 10.5\"/4 CUARTOS/26CM - 5CPS","f":"Sartén de 10.5 pulgadas o 4 cuartos o 26 cm de 5 capas","g":"Piezas sin Tapa","k":"sarten, freir, frying pan, 5 capas"},
{"c":"CO8010","n":"SIST COCINA COMPLEMENTO 5CPS 5 PZAS","f":"Sistema de cocina complementario de 5 capas y 5 piezas","g":"Piezas sin Tapa","k":"5 capas"},
{"c":"CO8546","n":"PLANCHA DOBLE 18\"X10\" - 5 CAPAS","f":"Plancha doble de 18 x 10 pulgadas de 5 capas","g":"Piezas sin Tapa","k":"comal, comal doble, budare, griddle, 5 capas"},
{"c":"CO8547","n":"PARRILLA REDONDA 12\"/30CM - 5 CAPAS","f":"","g":"Piezas sin Tapa","k":"comal redondo, grill, asador, 5 capas"},
{"c":"CO8548","n":"PLANCHA SENCILLA (11\"/28CM) - 5 CAPAS","f":"Plancha sencilla de 11 pulgadas o 28 cm de 5 capas","g":"Piezas sin Tapa","k":"comal, comal sencillo, budare, 5 capas"},
{"c":"CO8656","n":"SARTEN GOURMET 10\"/24CM - 5 CAPAS","f":"Sartén Gourmet de 10 pulgadas o 24 cm de 5 capas","g":"Piezas sin Tapa","k":"sarten, freir, frying pan, gourmet, 5 capas"},
{"c":"CO8661","n":"12\"/30CM GOURMET SKILLET ONLY 5 PLY","f":"","g":"Piezas sin Tapa","k":"sarten, freir, frying pan, gourmet, 5 capas"},
{"c":"CO9201","n":"OLLA DE 2 CUARTOS/16CM INNOVE 316L","f":"Olla de 2 cuartos o 16 cm Innové 316L","g":"Piezas sin Tapa","k":"olla, cocinar, pot, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9203","n":"OLLA DE 3 CUARTOS/20CM INNOVE 316L","f":"Olla de 3 cuartos o 20 cm Innové 316L","g":"Piezas sin Tapa","k":"olla, cocinar, pot, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9205","n":"OLLA DE 4QT/20CM INNOVE 316L","f":"Olla de 4 cuartos o 20 cm Innové 316L","g":"Piezas sin Tapa","k":"olla, cocinar, pot, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9207","n":"OLLA DE 6 CUARTOS/26CM INNOVE 316L","f":"Olla de 6 cuartos o 26 cm Innové 316L","g":"Piezas sin Tapa","k":"olla, cocinar, pot, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9209","n":"OLLA DE 8 CUARTOS/26CM INNOVE 316L","f":"Olla de 8 cuartos o 26 cm Innové 316L","g":"Piezas sin Tapa","k":"olla, cocinar, pot, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9211","n":"SARTEN DE 8\"/20CM INNOVE 316L","f":"Sartén de 8 pulgadas o 20 cm Innové 316L","g":"Piezas sin Tapa","k":"sarten, freir, frying pan, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9213","n":"SARTEN 10.5\"/4QT/26CM INNOVE 316L","f":"Sartén de 10.5 pulgadas o 4 cuartos o 26 cm Innové 316L","g":"Piezas sin Tapa","k":"sarten, freir, frying pan, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9218","n":"PLANCHA DOBLE INNOVE 316L","f":"Plancha doble Innové 316L","g":"Piezas sin Tapa","k":"comal, comal doble, budare, griddle, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9219","n":"PLANCHA REDONDA INNOVE 316L","f":"Plancha redonda Innové 316L","g":"Piezas sin Tapa","k":"comal, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9220","n":"PLANCHA SENCILLA INNOVE 316L","f":"Plancha sencilla Innové 316L","g":"Piezas sin Tapa","k":"comal, comal sencillo, budare, innove, linea innove, 316L, titanio quirurgico"},
{"c":"CO9229","n":"SARTEN GOURMET 8\"/20CM INNOVE 316L","f":"Sartén Gourmet de 8 pulgadas o 20 cm Innové 316L","g":"Piezas sin Tapa","k":"sarten, freir, frying pan, innove, linea innove, gourmet, 316L, titanio quirurgico"},
{"c":"CO9231","n":"SARTEN GOURMET INNOVE 316 10\"/24CM","f":"Sartén Gourmet Innové 316 de 10 pulgadas o 24 cm","g":"Piezas sin Tapa","k":"sarten, freir, frying pan, innove, linea innove, gourmet"},
{"c":"CO9233","n":"SARTEN GOURMET 12\"/30CM 316L INNOVE","f":"Sartén Gourmet de 12 pulgadas o 30 cm 316L Innové","g":"Piezas sin Tapa","k":"sarten, freir, frying pan, innove, linea innove, gourmet, 316L, titanio quirurgico"},
{"c":"CO9550","n":"OLLA NOVEL 1.5QT/16CM SIN TAPA","f":"Olla Novel de 1.5 cuartos o 16 cm sin tapa","g":"Piezas sin Tapa","k":"olla, cocinar, pot, novel, linea novel"},
{"c":"CO9555","n":"OLLA NOVEL 2QT/16CM SIN TAPA","f":"Olla Novel de 2 cuartos o 16 cm sin tapa","g":"Piezas sin Tapa","k":"olla, cocinar, pot, novel, linea novel"},
{"c":"CO9560","n":"OLLA NOVEL 3QT/20CM SIN TAPA","f":"Olla Novel de 3 cuartos o 20 cm sin tapa","g":"Piezas sin Tapa","k":"olla, cocinar, pot, novel, linea novel"},
{"c":"CO9570","n":"OLLA NOVEL 6QT/26CM SIN TAPA","f":"Olla Novel de 6 cuartos o 26 cm sin tapa","g":"Piezas sin Tapa","k":"olla, cocinar, pot, novel, linea novel"},
{"c":"CO9580","n":"SARTEN NOVEL 8\"/2QT/20CM SIN TAPA","f":"Sartén Novel de 8 pulgadas o 2 cuartos o 20 cm sin tapa","g":"Piezas sin Tapa","k":"sarten, freir, frying pan, novel, linea novel"},
{"c":"CO9590","n":"SARTEN NOVEL 10.5\"/4QT/26CM SIN TAPA","f":"Sartén Novel de 10.5 pulgadas o 4 cuartos o 26 cm sin tapa","g":"Piezas sin Tapa","k":"sarten, freir, frying pan, novel, linea novel"},
{"c":"CO9631","n":"SARTEN GOURMET RP 8\"/20CM SIN TAPA","f":"Sartén Gourmet Royal Prestige de 8 pulgadas o 20 cm sin tapa","g":"Piezas sin Tapa","k":"sarten, freir, frying pan, gourmet"},
{"c":"CO9641","n":"SARTEN GOURMET RP 10\"/20CM SIN TAPA","f":"Sartén Gourmet Royal Prestige de 10 pulgadas o 20 cm sin tapa","g":"Piezas sin Tapa","k":"sarten, freir, frying pan, gourmet"},
{"c":"CO9651","n":"SARTEN GOURMET RP 12\"/30CM SIN TAPA","f":"Sartén Gourmet Royal Prestige de 12 pulgadas o 30 cm sin tapa","g":"Piezas sin Tapa","k":"sarten, freir, frying pan, gourmet"},
{"c":"CO9685","n":"PLANCHA DOBLE DE 18\"X10\" RP","f":"","g":"Piezas sin Tapa","k":"comal, comal doble, budare, griddle"},
{"c":"CO9686","n":"PARRILLA REDONDA DE 12\"/30CM RP","f":"Parrilla redonda Royal Prestige de 12 pulgadas o 30 cm","g":"Piezas sin Tapa","k":"comal redondo, grill, asador"},
{"c":"CO9687","n":"PLANCHA SENCILLA (11\"/28CM) RP","f":"Plancha sencilla Royal Prestige de 11 pulgadas o 28 cm","g":"Piezas sin Tapa","k":"comal, comal sencillo, budare"},
{"c":"PR0008","n":"TABLA DE BAMBU CON BORDE SILICONA","f":"Tabla de bambú con borde de silicona","g":"Premiums","k":"tabla de picar, cortar, bambu"},
{"c":"PR0019","n":"PROTECTOR DE SARTENES 3PZS","f":"","g":"Premiums","k":"sarten, freir, frying pan, protector, guardar sartenes"},
{"c":"PR0021","n":"TABLA P/CORTAR DE BAMBU PEQ C/SILICON","f":"Tabla pequeña de bambú con silicona para cortar","g":"Premiums","k":"tabla de picar, cortar, bambu"},
{"c":"PR0025","n":"ROYAL PRESTIGE PERFECT POP","f":"Royal Prestige Perfect Pop","g":"Premiums","k":"palomitas, popcorn, crispetas, cotufas"},
{"c":"PR0109","n":"JGO CUBIERTOS AMERICAN 24PZS 18/8 US","f":"Juego de 24 piezas de cubiertos americanos de acero inoxidable 18/8","g":"Premiums","k":"cubiertos, cucharas, tenedores"},
{"c":"PR0196","n":"JGO DE UTENSILIOS DE COCINA 6PZAS","f":"Juego de utensilios de cocina de 6 piezas","g":"Premiums","k":"utensilios, servir"},
{"c":"PR1459","n":"EXPRIMIDOR DE JUGO ROYAL PRESTIGE","f":"Exprimidor de jugo Royal Prestige","g":"Premiums","k":"jugos, citricos, naranjas, exprimir"},
{"c":"PR1460","n":"3 COLADORES EXTRACTOR JUGO RP","f":"3 coladores para extractor de jugo Royal Prestige","g":"Premiums","k":"colador, escurridor, strainer"},
{"c":"PR1841","n":"AFILADOR DE CUCHILLOS RP INOX","f":"Afilador de cuchillos Royal Prestige de acero inoxidable","g":"Premiums","k":"cuchillo, knife, cortar, cuchilleria, afilar, sharpener, cuchillos"},
{"c":"PR2138","n":"CAFETERA ESPRESSO 4 TAZAS DP+","f":"","g":"Premiums","k":"cafe, greca, moka, espresso, tazas, termo"},
{"c":"PR2139","n":"CAFETERA ESPRESSO 10 TAZAS DP+","f":"","g":"Premiums","k":"cafe, greca, moka, espresso, tazas, termo"},
{"c":"PR2614","n":"MAQUINA DE ENSALADAS ROYAL PRESTIGE","f":"Máquina de ensaladas Royal Prestige","g":"Premiums","k":"cortador de verduras, rallador, ensaladas, procesador"},
{"c":"PR2675","n":"HERVIDOR 1/2 CUARTO RP MANGO NEGRO","f":"Hervidor de 1/2 cuarto Royal Prestige con mango negro","g":"Premiums","k":"tetera, pava, hervir agua, kettle"},
{"c":"PR2685","n":"HERVIDOR 1 CUARTO RP MANGO NEGRO","f":"Hervidor de 1 cuarto Royal Prestige con mango negro","g":"Premiums","k":"tetera, pava, hervir agua, kettle"},
{"c":"LT0025","n":"FOLLETO PROGRAMA 4 EN 14 ESPAÑOL","f":"Folleto del programa \"4 en 14\" en español","g":"Reclutamiento","k":"reclutamiento, oportunidad, entrenamiento"},
{"c":"LT2905","n":"LAMINAS DE VENTA NOVEL","f":"Láminas de venta Novel","g":"Reclutamiento","k":"novel, linea novel, reclutamiento, oportunidad, entrenamiento"},
{"c":"LT5300","n":"REVISTA OPORTUNIDAD ROYAL 25PK","f":"","g":"Reclutamiento","k":"reclutamiento, oportunidad, entrenamiento"},
{"c":"LT5301","n":"TRIPTICO OPORTUNIDAD ROYAL 25PK","f":"Tríptico de oportunidad Royal Prestige, paquete de 25","g":"Reclutamiento","k":"reclutamiento, oportunidad, entrenamiento"},
{"c":"LT2020","n":"TARJETAS PARA RASPAR ESP PQT 100","f":"Tarjetas para raspar en español, paquete de 100","g":"Suministros","k":"promocional, logo, suministros"},
{"c":"LT2493","n":"PORTA REGALO PAQUETE DE 10 ESP","f":"Porta regalo, paquete de 10 en español","g":"Suministros","k":"promocional, logo, suministros"},
{"c":"LT9006","n":"7 POSTERS INNOVE ESP","f":"7 posters Innové en español","g":"Suministros","k":"innove, linea innove, promocional, logo, suministros"},
{"c":"SE0027","n":"BOLSA DE PRODUCTO SM","f":"Bolsa para productos","g":"Suministros","k":"promocional, logo, suministros"},
{"c":"SE0028","n":"BOLSA DE PRODUCTO MD","f":"Bolsa de producto mediana","g":"Suministros","k":"promocional, logo, suministros"},
{"c":"SE0083","n":"RP COOLER","f":"Nevera portátil Royal Prestige","g":"Suministros","k":"hielera, nevera portatil, promocional, logo, suministros"},
{"c":"SE0091","n":"RP DIST JR PIN","f":"Pin de distribuidor Junior Royal Prestige","g":"Suministros","k":"promocional, logo, suministros, pin, insignia"},
{"c":"SE0092","n":"RP DISTRI PIN","f":"Pin de distribuidor Royal Prestige","g":"Suministros","k":"promocional, logo, suministros, pin, insignia"},
{"c":"SE0094","n":"MALETA EJECUTIVA RP LOGO","f":"Maleta ejecutiva con logo de Royal Prestige","g":"Suministros","k":"promocional, logo, suministros, maletin, presentaciones"},
{"c":"SE0193","n":"MALETIN DE NEGOCIOS RP LOGO","f":"Maletín de negocios con logo de Royal Prestige","g":"Suministros","k":"promocional, logo, suministros, maletin, presentaciones"},
{"c":"SE0371","n":"PRENDEDOR EMBAJADOR RP LOGO DORADO","f":"Prendedor de embajador con logo de Royal Prestige, color dorado","g":"Suministros","k":"promocional, logo, suministros, pin, insignia"},
{"c":"SE0373","n":"PRENDEDOR EMBAJADOR RP LOGO PLATA","f":"Prendedor de embajador con logo de Royal Prestige, color plata","g":"Suministros","k":"promocional, logo, suministros, pin, insignia"},
{"c":"SE0375","n":"PRENDEDOR DE EMPRENDEDOR RP LOGO","f":"Prendedor de emprendedor con logo de Royal Prestige","g":"Suministros","k":"promocional, logo, suministros, pin, insignia"},
{"c":"SE0376","n":"PRENDEDOR EMPRENDEDOR RP LOGO 10PK","f":"Prendedor de emprendedor con logo Royal Prestige, paquete de 10","g":"Suministros","k":"promocional, logo, suministros, pin, insignia"},
{"c":"SE0429","n":"POP SOCKET NEGRO LOGO RP PAQ 10","f":"PopSocket negro con logo Royal Prestige, paquete de 10","g":"Suministros","k":"promocional, logo, suministros"},
{"c":"SE0430","n":"ALMOHADILLA MOUSE LOGO RP PAQ 5","f":"Almohadilla para mouse con logo Royal Prestige, paquete de 5","g":"Suministros","k":"promocional, logo, suministros"},
{"c":"SE0649","n":"MANTEL RP LOGO","f":"Mantel con logo de Royal Prestige","g":"Suministros","k":"promocional, logo, suministros"},
{"c":"SE3000","n":"KIT DE PRESENTACION FRESCAFLOW","f":"Kit de presentación Frescaflow","g":"Suministros","k":"filtro de agua, purificador, agua, promocional, logo, suministros"},
{"c":"CO6516","n":"TAPA ALTA 26CM C/BASE 5Y9 CAPAS","f":"Tapa alta de 26 cm con base de 5 y 9 capas","g":"Tapas","k":"tapa, tapadera, cover, 9 capas"},
{"c":"CO6600","n":"TAPA PEQUEÑA 16CM","f":"","g":"Tapas","k":"tapa, tapadera, cover"},
{"c":"CO6605","n":"TAPA MEDIANA 20CM 5 & 9 PLY","f":"Tapa mediana de 20 cm de 5 y 9 capas","g":"Tapas","k":"tapa, tapadera, cover"},
{"c":"CO6610","n":"TAPA GRANDE DE 26CM 5Y9 CAPAS","f":"Tapa grande de 26 cm de 5 y 9 capas","g":"Tapas","k":"tapa, tapadera, cover, 9 capas"},
{"c":"CO9085","n":"TAPA PEQUEÑA INNOVE DE 16CM","f":"Tapa pequeña Innové de 16 cm","g":"Tapas","k":"tapa, tapadera, cover, innove, linea innove"},
{"c":"CO9086","n":"TAPA MEDIANA INNOVE DE 20CM","f":"","g":"Tapas","k":"tapa, tapadera, cover, innove, linea innove"},
{"c":"CO9087","n":"TAPA GRANDE INNOVE DE 26CM","f":"Tapa grande Innové de 26 cm","g":"Tapas","k":"tapa, tapadera, cover, innove, linea innove"},
{"c":"CO9088","n":"TAPA ALTA INNOVE 26CM C/REVESTIMIENTO","f":"Tapa alta Innové de 26 cm con revestimiento","g":"Tapas","k":"tapa, tapadera, cover, innove, linea innove"},
{"c":"CO9600","n":"TAPA PEQUEÑA NOVEL DE 16CM","f":"Tapa pequeña Novel de 16 cm","g":"Tapas","k":"tapa, tapadera, cover, novel, linea novel"},
{"c":"CO9605","n":"TAPA MEDIANA NOVEL DE 20CM","f":"Tapa mediana Novel de 20 cm","g":"Tapas","k":"tapa, tapadera, cover, novel, linea novel"},
{"c":"CO9610","n":"TAPA GRANDE NOVEL DE 26CM","f":"Tapa grande Novel de 26 cm","g":"Tapas","k":"tapa, tapadera, cover, novel, linea novel"},
{"c":"CO9620","n":"TAPA ALTA NOVEL 26CM C/REVESTIMIENTO","f":"Tapa alta Novel de 26 cm con revestimiento","g":"Tapas","k":"tapa, tapadera, cover, novel, linea novel"},
{"c":"CO4900","n":"RP JUEGO TAZONES P/MEZCLAR/RALLAR","f":"Juego de 5 piezas de tazones Royal Prestige para mezclar y rallar","g":"Utensilios","k":"bowl, tazon, mezclar, batir"},
{"c":"PR4902","n":"RP SET DE 3 TAZONES P/MEZCLAR","f":"Set de 3 tazones Royal Prestige para mezclar","g":"Utensilios","k":"bowl, tazon, mezclar, batir"},
{"c":"PR4904","n":"RP TAZONES P/MEZCLAR 4 PZS (2.8L)","f":"","g":"Utensilios","k":"bowl, tazon, mezclar, batir"},
{"c":"SP0091","n":"NVO JGO P/SERVIR COMPLEMENTARIO 3PZ-430SS","f":"Nuevo juego complementario de 3 piezas de acero inoxidable 430 para servir","g":"Utensilios","k":"utensilios, servir"},
{"c":"SP0095","n":"SERVIR COMPLEMENTO - SERVIDOR DE POSTRES","f":"","g":"Utensilios","k":"utensilios, servir"},
{"c":"SP0096","n":"SERVIR COMPLEMENTO - CUCHARON PARA PASTA","f":"","g":"Utensilios","k":"utensilios, servir"},
{"c":"SP0097","n":"SERVIR COMPLEMENTO - TENEDOR PARA SERVIR","f":"","g":"Utensilios","k":"utensilios, servir"},
{"c":"CR1670","n":"VASOS P/AGUA 16OZ PQT DE 4 LONDON","f":"Vasos para agua de 16 onzas, paquete de 4, modelo London","g":"Vasos y Copas","k":"vasos, cristaleria, termo"},
{"c":"CR1672","n":"VASOS CORTOS 12OZ PQT DE 4 LONDON","f":"","g":"Vasos y Copas","k":"vasos, cristaleria, termo"},
{"c":"CR2679","n":"JUEGO 4 COPAS DE VINO GALA 16OZ","f":"Juego de 4 copas de vino Gala de 16 onzas","g":"Vasos y Copas","k":"copas, vino, cristaleria"},
{"c":"CO7044","n":"SIS. COC.FAMILIAR-5CPS-10PZS C/CATL","f":"Sistema de cocina Familiar de 5 capas y 10 piezas con catálogo","g":"Mercancía","k":""},
{"c":"C09079","n":"OLLA ROYAL PRESTIGE DE 60QT C/TAPA","f":"Olla Royal Prestige de 60 cuartos con tapa","g":"Mercancía","k":"tamalera tamal"},
{"c":"C09685","n":"PLANCHA DOBLE DE 18\"X10\" RP","f":"Plancha doble Royal Prestige de 18 x 10 pulgadas","g":"Mercancía","k":"comal"},
{"c":"CO1661","n":"SARTEN \"GOURMET\"-12\"/30CM-5 CAPAS","f":"Sartén Gourmet de 12 pulgadas o 30 cm de 5 capas","g":"Mercancía","k":""},
{"c":"CO6030","n":"OLLA DE 1.5 CRTOS/16CM-5 CAPAS","f":"Olla de 1.5 cuartos o 16 cm de 5 capas","g":"Mercancía","k":""},
{"c":"CO6056","n":"OLLA DE 8 CUARTOS/26CM-5CAPAS","f":"Olla de 8 cuartos o 26 cm de 5 capas","g":"Mercancía","k":""},
{"c":"CO6547","n":"PARRILLA REDONDA-12\"/30CM-5CPAS","f":"Parrilla redonda de 12 pulgadas o 30 cm de 5 capas","g":"Mercancía","k":""},
{"c":"PR4901","n":"RP TAZONES P/ MEZCLAR 4 PZS (2.8L)","f":"Tazones Royal Prestige para mezclar de 4 piezas (2.8 litros)","g":"Premiums","k":""},
{"c":"C09086","n":"TAPA MEDIANA INNOVE DE 20CM","f":"Tapa mediana Innové de 20 cm","g":"Mercancía","k":""},
{"c":"CO6500","n":"TAPA PEQUEÑA DE 16CM-5Y9 CPAS","f":"Tapa pequeña de 16 cm de 5 y 9 capas","g":"Mercancía","k":""},
{"c":"PR2128","n":"CAFETER ESPRSSO 4 TAZAS DOBLE PARED","f":"Cafetera de espresso de 4 tazas con doble pared","g":"Premiums","k":""},
{"c":"PR2129","n":"CAFETRA ESPRESSO 10 TAZS DBLE PARED","f":"Cafetera de espresso de 10 tazas con doble pared","g":"Premiums","k":""},
{"c":"CR2672","n":"PAQUETE DE 4 VASOS DE 10 ONZAS","f":"Paquete de 4 vasos de 10 onzas","g":"Premiums","k":""},
{"c":"WF0451","n":"CARTCH DE RMPLAZO-FP 3K/3KPLUS/3500","f":"Cartucho de reemplazo para Frescasure 3000, 3000 Plus y 3500","g":"Mercancía","k":""},
{"c":"WF0500","n":"CRTCH DE RMPLAZO 4.5\" (C/ENVLTR)-CRT NSF","f":"Cartucho de reemplazo de 4.5 pulgadas con envoltorio y certificado NSF","g":"Mercancía","k":""},
{"c":"SP0362","n":"2 TAZONES BASE SILCONA C/TAPA 304SS","f":"2 tazones de acero inoxidable 304 con base de silicona y tapa","g":"Miscelaneos","k":""},
{"c":"LT2179","n":"RECETARIO OLLA DE PRESION RP","f":"Recetario de olla de presión Royal Prestige","g":"Miscelaneos","k":""},
{"c":"LT6300","n":"REVISTA PLAN DE NEGOCIO-PAQ 10PCS","f":"Revista \"Plan de Negocio\", paquete de 10 piezas","g":"Miscelaneos","k":""},
{"c":"LT2177","n":"FOLLETO DE OLLAS DE PRESIÓN ESP-ING","f":"Folleto de ollas de presión en español e inglés","g":"Miscelaneos","k":""},
{"c":"RP4470","n":"AGARR. LARGA-SARTÉN 10\" -5 CPS","f":"Agarradera larga para sartén de 10 pulgadas de 5 capas","g":"Miscelaneos","k":""},
{"c":"RP4674","n":"MANGO P/SARTÉN GOURMET 8\"/20CM-NOV","f":"Mango para sartén Gourmet de 8 pulgadas o 20 cm Novel","g":"Miscelaneos","k":""},
{"c":"RP4678","n":"MANGO P/SARTÉN GOURMET 12\"/30CM-NOV","f":"Mango para sartén Gourmet de 12 pulgadas o 30 cm Novel","g":"Miscelaneos","k":""},
{"c":"RP9718","n":"MANGOSARTEN 3.5QT-3.31L EASYREALISE","f":"Mango de sartén de 3.5 cuartos o 3.31 litros Easy Release","g":"Miscelaneos","k":""},
{"c":"RP5461","n":"MANGO-PLANCHA SENCILLA DE 11\"/25CM","f":"Mango para plancha sencilla de 11 pulgadas o 25 cm","g":"Miscelaneos","k":""},
{"c":"RP4453","n":"AGARR P/BASE-BANDEJA P/ASAR ACERO","f":"Agarradera para base de bandeja de acero para asar","g":"Miscelaneos","k":""},
{"c":"RP4461","n":"MANGO-PLANCHA SENCILLA DE 11\"/25CM","f":"Mango para plancha sencilla de 11 pulgadas o 25 cm","g":"Miscelaneos","k":""},
{"c":"RP6162","n":"VÁLVULAT FP6000 DEBAJO MOSTRADOR","f":"Válvula de Frescasure 6000 para debajo del mostrador","g":"Miscelaneos","k":""},
{"c":"RP4540","n":"MONITOR DE FLUJO FRESCAPURE 5000","f":"Monitor de flujo Frescasure 5000","g":"Miscelaneos","k":""},
{"c":"CO3017","n":"RP ELITE 3.5QT SAUTE PAN ONLY","f":"Royal Prestige Elite sartén para saltear de 3.5 cuartos (solo)","g":"Mercancía","k":""},
{"c":"CO3018","n":"RP ELITE 4QT DUTCH OVEN","f":"Royal Prestige Elite horno holandés de 4 cuartos","g":"Mercancía","k":""}
];

const ESTADOS_IMPUESTO = {"AL":["Alabama",9.44],"AK":["Alaska",1.82],"AZ":["Arizona",8.52],"AR":["Arkansas",9.48],"CA":["California",8.99],"CO":["Colorado",7.86],"CT":["Connecticut",6.35],"DE":["Delaware",0.0],"FL":["Florida",7.02],"GA":["Georgia",7.43],"HI":["Hawaii",4.5],"ID":["Idaho",6.03],"IL":["Illinois",8.96],"IN":["Indiana",7.0],"IA":["Iowa",6.94],"KS":["Kansas",8.69],"KY":["Kentucky",6.0],"LA":["Louisiana",10.11],"ME":["Maine",5.5],"MD":["Maryland",6.0],"MA":["Massachusetts",6.25],"MI":["Michigan",6.0],"MN":["Minnesota",8.04],"MS":["Mississippi",7.07],"MO":["Missouri",8.29],"MT":["Montana",0.0],"NE":["Nebraska",6.95],"NV":["Nevada",8.24],"NH":["New Hampshire",0.0],"NJ":["New Jersey",6.63],"NM":["New Mexico",7.63],"NY":["New York",8.54],"NC":["North Carolina",7.0],"ND":["North Dakota",7.04],"OH":["Ohio",7.24],"OK":["Oklahoma",9.06],"OR":["Oregon",0.0],"PA":["Pennsylvania",6.34],"RI":["Rhode Island",7.0],"SC":["South Carolina",7.49],"SD":["South Dakota",6.11],"TN":["Tennessee",9.61],"TX":["Texas",8.25],"UT":["Utah",7.25],"VT":["Vermont",6.24],"VA":["Virginia",5.77],"WA":["Washington",9.47],"WV":["West Virginia",6.57],"WI":["Wisconsin",5.72],"WY":["Wyoming",5.56],"DC":["Washington DC",6.0],"PR":["Puerto Rico",11.5]};

const TC = {
  bg:"#f0f2f5", panel:"#ffffff", border:"#d0d4dc", borderHi:"#b8cae8",
  blue:"#1a3a6b", blueMid:"#2756a8", blueLight:"#4a7fd4", bluePale:"#e8edf8",
  red:"#c0392b", text:"#2c2c2c", mut:"#8a8a8a",
  serif:"'Playfair Display', serif",
  glow:"0 2px 12px rgba(26,58,107,.10)", glowLg:"0 6px 28px rgba(26,58,107,.14)",
};
const fmtC = (n) => "$" + Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const CATS_RP = Array.from(new Set(CATALOGO_RP.map(p=>p.g))).sort((a,b)=>a.localeCompare(b,"es"));

const sinAcentos = (t) => (t||"").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
// Grupos que van AL FINAL de los resultados (la mercadería siempre primero)
const GRUPOS_SECUNDARIOS = ["Premiums","Miscelaneos","Literatura de Venta","Materiales Clientes","Suministros","Ordenes de Compra","Reclutamiento","Kits Novato"];
// Catálogo base + cambios del equipo (agregados / editados / eliminados)
function catalogoConCustom(custom){
  const c = custom || {};
  const elim = new Set(c.eliminados || []);
  const edit = c.editados || {};
  const base = CATALOGO_RP.filter(p=>!elim.has(p.c)).map(p=>edit[p.c] ? {...p, ...edit[p.c]} : p);
  const agregados = (c.agregados || []).filter(p=>!elim.has(p.c)).map(p=>({...p, _custom:true}));
  return [...base, ...agregados];
}
function filtrarCatalogo(q, cat, custom){
  // Búsqueda ABIERTA: cada palabra puede aparecer en cualquier parte del
  // producto (código, nombre, descripción o palabras clave), sin acentos.
  // "presion 10" encuentra "Olla de presión de 10 litros".
  const toks = sinAcentos(q).trim().split(/\s+/).filter(Boolean);
  const out = catalogoConCustom(custom).filter(p=>{
    if(cat!=="ALL" && p.g!==cat) return false;
    if(!toks.length) return true;
    const hay = sinAcentos([p.c,p.n,p.f,p.k].filter(Boolean).join(" "));
    return toks.every(t=>hay.includes(t));
  });
  // Mercadería primero; premios, misceláneos y materiales internos al final
  return out.sort((a,b)=>(GRUPOS_SECUNDARIOS.includes(a.g)?1:0)-(GRUPOS_SECUNDARIOS.includes(b.g)?1:0));
}

function copiarTexto(txt, ok){
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(ok).catch(()=>{ fallbackCopy(txt); ok(); });
    } else { fallbackCopy(txt); ok(); }
  }catch(e){ try{ fallbackCopy(txt); }catch(e2){} ok(); }
}
function fallbackCopy(txt){
  const ta=document.createElement("textarea");
  ta.value=txt; ta.style.position="fixed"; ta.style.opacity="0";
  document.body.appendChild(ta); ta.focus(); ta.select();
  document.execCommand("copy"); document.body.removeChild(ta);
}

/* ── Lista de productos (compartida por ambas pestañas) ── */
function ListaProductos({ items, limite, sel, onPick, copiado, onEditar, onEliminar }){
  const mostrar = items.slice(0, limite);
  return (
    <div className="rounded-xl overflow-y-auto" style={{border:"1px solid "+TC.border, maxHeight:420, background:"#fff"}}>
      {mostrar.length===0 && (
        <div className="text-center py-10" style={{color:TC.mut}}>
          <div className="mb-2 flex justify-center"><Ico e="🔍" size={30} strokeWidth={1.25} className="opacity-40" /></div>
          <div className="text-sm font-bold">Sin resultados. Prueba otra palabra o código.</div>
        </div>
      )}
      {mostrar.map((p,i)=>(
        <button key={p.c+"-"+i} onClick={()=>onPick(p)}
          className="w-full text-left flex items-start gap-3 px-3 py-3 transition active:scale-[.99]"
          style={{borderBottom:i<mostrar.length-1?"1px solid "+TC.bg:"none", background: sel&&sel.c===p.c ? TC.bluePale : "#fff", borderLeft: sel&&sel.c===p.c ? "3px solid "+TC.blueMid : "3px solid transparent"}}>
          <span className="text-[11px] font-black px-2 py-1 rounded-md whitespace-nowrap" style={{background: copiado===p.c ? "#1d8a4f" : TC.blue, color:"#fff", letterSpacing:".04em"}}>
            {copiado===p.c ? <><Ico e="✓" className="mr-1" />Copiado</> : p.c}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-bold leading-snug" style={{color:TC.text}}>{p.f || p.n}</span>
            {p.f && p.f!==p.n && <span className="block text-[10px] mt-0.5" style={{color:TC.mut}}>{p.n}</span>}
            <span className="block text-[10px] font-black uppercase mt-0.5" style={{color:TC.blueMid, letterSpacing:".08em"}}>{p.g}{p._custom?" · ✳️ agregado por el equipo":""}</span>
          </span>
          {(onEditar||onEliminar) && (
            <span className="flex gap-1 shrink-0" onClick={e=>e.stopPropagation()}>
              {onEditar && <span role="button" onClick={()=>onEditar(p)} className="w-7 h-7 flex items-center justify-center rounded-lg text-xs" style={{background:TC.bg, border:"1px solid "+TC.border}}><Ico e="✏" /></span>}
              {onEliminar && <span role="button" onClick={()=>onEliminar(p)} className="w-7 h-7 flex items-center justify-center rounded-lg text-xs" style={{background:"#fef2f2", border:"1px solid #fecaca"}}><Ico e="🗑" /></span>}
            </span>
          )}
        </button>
      ))}
      {items.length>limite && (
        <div className="px-3 py-3 text-center text-xs italic" style={{color:TC.mut}}>+ {items.length-limite} más — refina tu búsqueda</div>
      )}
    </div>
  );
}

/* ── Filtros de categoría (chips con scroll horizontal, amigable iPhone) ── */
function ChipsCategorias({ cat, setCat }){
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2" style={{WebkitOverflowScrolling:"touch"}}>
      <button onClick={()=>setCat("ALL")} className="px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition"
        style={cat==="ALL"?{background:TC.blueMid,color:"#fff",border:"1.5px solid "+TC.blueMid}:{background:TC.bg,color:"#5a5a5a",border:"1.5px solid "+TC.border}}>Todos</button>
      {CATS_RP.map(c=>(
        <button key={c} onClick={()=>setCat(c)} className="px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition"
          style={cat===c?{background:TC.blueMid,color:"#fff",border:"1.5px solid "+TC.blueMid}:{background:TC.bg,color:"#5a5a5a",border:"1.5px solid "+TC.border}}>{c}</button>
      ))}
    </div>
  );
}

/* ══════════ PESTAÑA 1: BUSCADOR DE CÓDIGOS ══════════ */
function BuscadorCodigos({ catalogoCustom, setCatalogoCustom, puedeEditar }){
  const [q,setQ]=useState("");
  const [cat,setCat]=useState("ALL");
  const [copiado,setCopiado]=useState(null);
  const [prodForm,setProdForm]=useState(null); // null | {c,n,f,g,k,_esNuevo,_original}
  const items = useMemo(()=>filtrarCatalogo(q,cat,catalogoCustom),[q,cat,catalogoCustom]);
  const totalCat = useMemo(()=>catalogoConCustom(catalogoCustom).length,[catalogoCustom]);
  const pick=(p)=>{ copiarTexto(p.c, ()=>{ setCopiado(p.c); setTimeout(()=>setCopiado(c=>c===p.c?null:c),1600); }); };
  const abrirNuevoProd=()=>setProdForm({c:"",n:"",f:"",g:"Mercancía",k:"",_esNuevo:true});
  const abrirEditarProd=(p)=>setProdForm({c:p.c,n:p.n||"",f:p.f||"",g:p.g||"Mercancía",k:p.k||"",_esNuevo:false,_original:p.c,_custom:!!p._custom});
  const guardarProd=()=>{
    const f=prodForm;
    if(!(f.c||"").trim() || !(f.n||"").trim()){ alert("✍️ Código y nombre son obligatorios."); return; }
    const cod=f.c.trim().toUpperCase();
    if(f._esNuevo && catalogoConCustom(catalogoCustom).some(p=>p.c===cod)){ alert("⚠️ Ese código ya existe en el catálogo."); return; }
    setCatalogoCustom(prev=>{
      const cc={ agregados:[...((prev||{}).agregados||[])], editados:{...((prev||{}).editados||{})}, eliminados:[...((prev||{}).eliminados||[])] };
      const datos={ c:cod, n:f.n.trim(), f:(f.f||"").trim(), g:f.g||"Mercancía", k:(f.k||"").trim() };
      if(f._esNuevo){
        cc.agregados.push(datos);
      } else if(f._custom){
        cc.agregados = cc.agregados.map(p=>p.c===f._original?datos:p);
      } else {
        cc.editados[f._original]=datos; // el original queda respaldado; se muestra la versión editada
      }
      cc.eliminados = cc.eliminados.filter(x=>x!==cod);
      return cc;
    });
    setProdForm(null);
  };
  const eliminarProd=(p)=>{
    if(!confirm(`¿Quitar "${p.n}" (${p.c}) del buscador?`)) return;
    setCatalogoCustom(prev=>{
      const cc={ agregados:[...((prev||{}).agregados||[])], editados:{...((prev||{}).editados||{})}, eliminados:[...((prev||{}).eliminados||[])] };
      if(p._custom) cc.agregados = cc.agregados.filter(x=>x.c!==p.c);
      else if(!cc.eliminados.includes(p.c)) cc.eliminados.push(p.c);
      delete cc.editados[p.c];
      return cc;
    });
  };
  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div className="rounded-2xl p-5" style={{background:TC.panel, border:"1px solid "+TC.border, boxShadow:TC.glow}}>
        <div className="text-lg font-bold" style={{fontFamily:TC.serif, color:TC.blue}}>Buscador de Códigos</div>
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="text-xs" style={{color:TC.mut}}>{totalCat} productos · Toca un producto para copiar su código</div>
          {puedeEditar && <button onClick={abrirNuevoProd} className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-black text-white" style={{background:TC.blueMid}}>+ Producto</button>}
        </div>
        <div className="relative mb-2">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base" style={{color:TC.blueLight}}>⌕</span>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar: tamalera, sartén, CO9846…" inputMode="search"
            className="w-full rounded-lg pl-9 pr-3 py-2.5 text-sm font-semibold outline-none"
            style={{background:TC.bg, border:"2px solid "+TC.border, color:"#111"}} />
        </div>
        <ChipsCategorias cat={cat} setCat={setCat} />
        <div className="text-xs font-bold mb-2" style={{color:TC.mut}}>{items.length} producto{items.length!==1?"s":""}</div>
        <ListaProductos items={items} limite={100} sel={null} onPick={pick} copiado={copiado} onEditar={puedeEditar?abrirEditarProd:null} onEliminar={puedeEditar?eliminarProd:null} />
      </div>
      {prodForm && (
        <Modal title={prodForm._esNuevo?<><Ico e="➕" className="mr-1" />Nuevo producto</>:<><Ico e="✏" className="mr-1" />Editar producto</>} onClose={()=>setProdForm(null)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código" required><input className={inpLight} value={prodForm.c} onChange={e=>setProdForm(p=>({...p,c:e.target.value}))} placeholder="CO9846" autoCapitalize="characters" /></Field>
            <Field label="Categoría"><select className={inpLight} value={prodForm.g} onChange={e=>setProdForm(p=>({...p,g:e.target.value}))}>{CATS_RP.map(c=><option key={c} value={c}>{c}</option>)}</select></Field>
          </div>
          <Field label="Nombre del producto" required><input className={inpLight} value={prodForm.n} onChange={e=>setProdForm(p=>({...p,n:e.target.value}))} placeholder="OLLA DE PRESIÓN 10 LTS" /></Field>
          <Field label="Descripción (opcional)"><input className={inpLight} value={prodForm.f} onChange={e=>setProdForm(p=>({...p,f:e.target.value}))} placeholder="Olla de presión Royal Prestige de 10 litros" /></Field>
          <Field label="Palabras clave (separadas por coma)"><input className={inpLight} value={prodForm.k} onChange={e=>setProdForm(p=>({...p,k:e.target.value}))} placeholder="presion, olla grande, pressure cooker" /></Field>
          <button onClick={guardarProd} className="w-full py-3 rounded-xl text-sm font-bold text-white mt-1" style={{background:RP.navy}}><Ico e="✅" className="mr-1.5" />Guardar producto</button>
        </Modal>
      )}
    </div>
  );
}

/* ══════════ PESTAÑA 2: SIMULADOR DE COMPRA (réplica exacta de la app web v8) ══════════ */
function SimuladorCompra(){
  const [precio,setPrecio]=useState("");
  const [estado,setEstado]=useState("TX");
  const [envio,setEnvio]=useState("");
  const [envioManual,setEnvioManual]=useState(false);
  const [depPct,setDepPct]=useState(5);
  const [depAmt,setDepAmt]=useState("");
  const [depMode,setDepMode]=useState("pct"); // 'pct' | 'amt'
  const [balance,setBalance]=useState("");
  const [pagoCustom,setPagoCustom]=useState("");

  /* ── Cálculo (misma lógica que la app web) ── */
  const nPrecio=parseFloat(precio)||0;
  const nEnvio=parseFloat(envio)||0;
  const nBalance=parseFloat(balance)||0;
  const tasa=(ESTADOS_IMPUESTO[estado]?ESTADOS_IMPUESTO[estado][1]:0)/100;
  const subtotal=nPrecio+nEnvio;
  const impuesto=subtotal*tasa;
  const totalVenta=subtotal+impuesto;
  // Depósito: base = Total de Venta SOLAMENTE (el balance NO afecta el depósito)
  const deposito = depMode==="amt" ? (parseFloat(depAmt)||0) : totalVenta*((parseFloat(depPct)||0)/100);
  const pctReal = totalVenta>0 ? (deposito/totalVenta)*100 : 0;
  const financeSub = Math.max(0, totalVenta-deposito);
  const financeTotal = financeSub + nBalance;

  const cambiarPrecio=(v)=>{
    setPrecio(v);
    const p=parseFloat(v)||0;
    if(!envioManual) setEnvio(p>0?(p*0.05).toFixed(2):"");
  };
  const cambiarEnvio=(v)=>{ setEnvio(v); setEnvioManual(true); };
  const setPctSync=(v)=>{ const x=Math.min(100,Math.max(0,parseFloat(v)||0)); setDepPct(x); setDepMode("pct"); };
  const setAmtSync=(v)=>{ setDepAmt(v); setDepMode("amt"); };

  // Sincronización visual de los 3 controles
  const pctMostrar = depMode==="pct" ? depPct : pctReal;
  const amtMostrar = depMode==="amt" ? depAmt : (deposito>0?deposito.toFixed(2):"");

  /* Planes fijos: pago mensual = financeTotal × factor; total = pago×meses + depósito */
  const planes=[
    {meses:32, factor:0.04, destaca:true},
    {meses:24, factor:0.05},
    {meses:16, factor:0.07},
    {meses:12, factor:0.09},
  ].map(pl=>({...pl, pago:financeTotal*pl.factor, total:financeTotal*pl.factor*pl.meses+deposito}));

  /* Pago personalizado — amortización 1.5% mensual sobre saldo decreciente */
  const custom=useMemo(()=>{
    const pago=parseFloat(pagoCustom)||0;
    const RATE=0.015, MAX=600;
    if(financeTotal<=0 || pago<=0) return null;
    if(pago<=financeTotal*RATE) return {infinito:true};
    let saldo=financeTotal, meses=0, totalPagado=0, totalInteres=0, ultimo=0;
    while(saldo>0.005 && meses<MAX){
      const interes=saldo*RATE;
      totalInteres+=interes; saldo+=interes; meses++;
      if(saldo<=pago){ ultimo=saldo; totalPagado+=saldo; saldo=0; }
      else { totalPagado+=pago; saldo-=pago; ultimo=pago; }
    }
    return {meses, ultimo, totalPagado:totalPagado+deposito, totalInteres};
  },[pagoCustom, financeTotal, deposito]);

  const Fila=({l,v,strong,pale,neg})=>(
    <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={pale?{background:TC.bluePale}:{}}>
      <span className={"text-[13px] "+(strong?"font-black":"font-semibold")} style={{color:strong?TC.blue:"#5a5a5a"}}>{l}</span>
      <span className={"text-[14px] "+(strong?"font-black":"font-bold")} style={{color:neg?TC.red:(strong?TC.blue:TC.text)}}>{v}</span>
    </div>
  );
  const inp={background:"#fff", border:"2px solid "+TC.border, color:"#111"};

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      {/* CONFIGURA TU COMPRA */}
      <div className="rounded-2xl p-5 space-y-4" style={{background:TC.panel, border:"1px solid "+TC.border, boxShadow:TC.glow}}>
        <div>
          <div className="text-lg font-bold" style={{fontFamily:TC.serif, color:TC.blue}}>Configura tu Compra</div>
          <div className="text-xs" style={{color:TC.mut}}>Ingresa los datos para calcular el financiamiento</div>
        </div>
        <div>
          <label className="block text-[13px] font-black mb-1.5" style={{color:TC.text}}>Precio del Producto</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black" style={{color:TC.blueMid}}>$</span>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={precio} onChange={e=>cambiarPrecio(e.target.value)} placeholder="0.00"
              className="w-full rounded-lg pl-7 pr-3 py-2.5 text-base font-bold outline-none" style={inp} />
          </div>
        </div>
        <div>
          <label className="block text-[13px] font-black mb-1.5" style={{color:TC.text}}>Estado de Envío</label>
          <select value={estado} onChange={e=>setEstado(e.target.value)} className="w-full rounded-lg px-3 py-2.5 text-sm font-bold outline-none" style={inp}>
            {Object.entries(ESTADOS_IMPUESTO).sort((a,b)=>a[1][0].localeCompare(b[1][0])).map(([k,[n,r]])=>(
              <option key={k} value={k}>{n} ({r.toFixed(2)}%)</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[13px] font-black mb-1.5" style={{color:TC.text}}>Costo de Envío <span className="font-normal text-xs" style={{color:TC.mut}}>(promedio 5%, editable)</span></label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black" style={{color:TC.blueMid}}>$</span>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={envio} onChange={e=>cambiarEnvio(e.target.value)} placeholder="0.00"
              className="w-full rounded-lg pl-7 pr-3 py-2.5 text-base font-bold outline-none" style={inp} />
          </div>
          <div className="text-[11px] mt-1" style={{color:TC.mut}}>Se calcula automático al 5% del precio · puedes editarlo</div>
        </div>
        <div>
          <label className="block text-[13px] font-black mb-1.5" style={{color:TC.text}}>Depósito Inicial <span className="font-normal text-xs" style={{color:TC.mut}}>(sugerido 5%)</span></label>
          <div className="inline-block text-[13px] font-black text-white px-3 py-1 rounded-md mb-2" style={{background:TC.blue}}>{Math.round(pctMostrar)}% · {fmtC(deposito)}</div>
          <input type="range" min="0" max="100" step="1" value={Math.min(100,Math.round(pctMostrar))} onChange={e=>setPctSync(e.target.value)} className="w-full" style={{accentColor:TC.blueMid}} />
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div>
              <label className="block text-[11px] font-black mb-1" style={{color:TC.text}}>Porcentaje (%)</label>
              <input type="number" inputMode="decimal" min="0" max="100" step="1" value={depMode==="pct"?depPct:pctReal.toFixed(1)} onChange={e=>setPctSync(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm font-bold outline-none" style={inp} />
            </div>
            <div>
              <label className="block text-[11px] font-black mb-1" style={{color:TC.text}}>Monto ($)</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-black" style={{color:TC.blueMid}}>$</span>
                <input type="number" inputMode="decimal" min="0" step="0.01" value={amtMostrar} onChange={e=>setAmtSync(e.target.value)} placeholder="0.00"
                  className="w-full rounded-lg pl-6 pr-2 py-2 text-sm font-bold outline-none" style={inp} />
              </div>
            </div>
          </div>
          <div className="text-[11px] mt-1" style={{color:TC.mut}}>Slider · % · o monto en $ — los tres se sincronizan</div>
        </div>
        <div>
          <label className="block text-[13px] font-black mb-1.5" style={{color:TC.text}}>Balance Pendiente <span className="font-normal text-xs" style={{color:TC.mut}}>(deuda anterior del cliente)</span></label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black" style={{color:TC.blueMid}}>$</span>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={balance} onChange={e=>setBalance(e.target.value)} placeholder="0.00"
              className="w-full rounded-lg pl-7 pr-3 py-2.5 text-base font-bold outline-none" style={inp} />
          </div>
          <div className="text-[11px] mt-1" style={{color:TC.mut}}>Se suma al monto a financiar después del depósito</div>
        </div>
      </div>

      {/* RESUMEN DE INVERSIÓN */}
      <div className="rounded-2xl p-5" style={{background:TC.panel, border:"2px solid "+TC.blue, boxShadow:TC.glowLg}}>
        <div className="text-center mb-4">
          <div className="text-xl font-black" style={{fontFamily:TC.serif, color:TC.blue}}>Resumen de Inversión</div>
          <div className="text-[11px] tracking-[.4em]" style={{color:TC.blueLight}}>◆ ◆ ◆</div>
        </div>
        <div className="space-y-1">
          <Fila l="Precio del producto" v={fmtC(nPrecio)} />
          <Fila l="Costo de envío" v={fmtC(nEnvio)} />
          <Fila l="Subtotal" v={fmtC(subtotal)} />
          <Fila l={"Impuesto ("+(tasa*100).toFixed(2)+"%)"} v={fmtC(impuesto)} />
          <Fila l="Total de Venta" v={fmtC(totalVenta)} strong />
          <Fila l={"Depósito inicial ("+pctReal.toFixed(1)+"%)"} v={"− "+fmtC(deposito)} pale />
          <Fila l="Monto a financiar (venta)" v={fmtC(financeSub)} pale />
          {nBalance>0 && <Fila l="Balance pendiente" v={"+ "+fmtC(nBalance)} neg />}
          <Fila l="Monto Total a Financiar" v={fmtC(financeTotal)} strong pale />
        </div>

        <div className="text-[11px] font-black uppercase tracking-widest mt-5 mb-2" style={{color:TC.mut}}>Opciones de Financiamiento</div>
        <div className="grid grid-cols-2 gap-2">
          {planes.map(pl=>(
            <div key={pl.meses} className="rounded-xl p-3 text-center relative" style={pl.destaca?{border:"2px solid "+TC.blueMid, background:TC.bluePale}:{border:"1px solid "+TC.border, background:"#fff"}}>
              {pl.destaca && <div className="text-[9px] font-black uppercase tracking-wider" style={{color:TC.blueMid}}><Ico e="★" className="mr-1.5" />Recomendado</div>}
              <div className="text-[12px] font-black" style={{color:TC.text}}>{pl.meses} Meses</div>
              <div className="text-xl font-black my-0.5" style={{fontFamily:TC.serif, color:TC.blue}}>{fmtC(pl.pago)}<span className="text-[10px] font-bold ml-1" style={{color:TC.mut}}>por mes</span></div>
              <div className="text-[10px]" style={{color:TC.mut}}>Total a pagar: <b style={{color:TC.text}}>{fmtC(pl.total)}</b></div>
            </div>
          ))}
        </div>

        {/* PAGO MENSUAL PERSONALIZADO */}
        <div className="text-[11px] font-black uppercase tracking-widest mt-5 mb-2" style={{color:TC.mut}}>Pago Mensual Personalizado</div>
        <div className="rounded-xl p-4" style={{background:TC.bg, border:"1px solid "+TC.border}}>
          <label className="block text-[13px] font-black mb-1.5" style={{color:TC.text}}>¿Cuánto puedes pagar al mes?</label>
          <div className="relative mb-3">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black" style={{color:TC.blueMid}}>$</span>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={pagoCustom} onChange={e=>setPagoCustom(e.target.value)} placeholder="0.00"
              className="w-full rounded-lg pl-7 pr-3 py-2.5 text-base font-bold outline-none" style={inp} />
          </div>
          <div className="rounded-xl p-4 text-center" style={{background:"#fff", border:"2px solid "+(custom&&custom.infinito?TC.red:TC.blue)}}>
            <div className="text-[10px] font-black uppercase tracking-widest mb-1" style={{color:TC.mut}}>Meses exactos para liquidar</div>
            <div className="text-3xl font-black" style={{fontFamily:TC.serif, color:custom&&custom.infinito?TC.red:TC.blue}}>
              {!custom ? "—" : custom.infinito ? "∞" : custom.meses+" mes"+(custom.meses!==1?"es":"")}
            </div>
            {custom && custom.infinito && <div className="text-[11px] mt-1 font-bold" style={{color:TC.red}}>El pago no cubre los intereses</div>}
            {custom && !custom.infinito && (
              <div className="grid grid-cols-3 gap-2 mt-3 text-left">
                <div><div className="text-[9px] font-black uppercase" style={{color:TC.mut}}>Último pago</div><div className="text-[12px] font-black" style={{color:TC.text}}>{fmtC(custom.ultimo)}</div></div>
                <div><div className="text-[9px] font-black uppercase" style={{color:TC.mut}}>Total pagado</div><div className="text-[12px] font-black" style={{color:TC.text}}>{fmtC(custom.totalPagado)}</div></div>
                <div><div className="text-[9px] font-black uppercase" style={{color:TC.mut}}>Intereses</div><div className="text-[12px] font-black" style={{color:TC.text}}>{fmtC(custom.totalInteres)}</div></div>
              </div>
            )}
          </div>
          <div className="text-[10px] mt-2 text-center" style={{color:TC.mut}}>Interés simulado: 1.5% mensual sobre saldo decreciente</div>
        </div>
        <div className="text-[10px] mt-3 text-center italic" style={{color:TC.mut}}>Los montos son una estimación con fines informativos. Los impuestos pueden variar según condado.</div>
      </div>
    </div>
  );
}

return { BuscadorCodigos, SimuladorCompra };
})();
export const BuscadorCodigos = __CatalogoModule.BuscadorCodigos;
export const SimuladorCompra = __CatalogoModule.SimuladorCompra;
