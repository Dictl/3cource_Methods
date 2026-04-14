--
-- PostgreSQL database dump
--

\restrict s5s5zRhMnUGxS1KjYzdOWUt7zv522ztwFpfV5w1LxWeenTeMlmSZRNOsUqb5rUu

-- Dumped from database version 14.22 (Ubuntu 14.22-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.22 (Ubuntu 14.22-0ubuntu0.22.04.1)

-- Started on 2026-04-14 03:41:20 MSK

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.product DROP CONSTRAINT IF EXISTS product_classifier_node_id_fkey;
ALTER TABLE IF EXISTS ONLY public.classifier_node DROP CONSTRAINT IF EXISTS classifier_node_parent_id_fkey;
ALTER TABLE IF EXISTS ONLY public.product DROP CONSTRAINT IF EXISTS product_sku_key;
ALTER TABLE IF EXISTS ONLY public.product DROP CONSTRAINT IF EXISTS product_pkey;
ALTER TABLE IF EXISTS ONLY public.classifier_node DROP CONSTRAINT IF EXISTS classifier_node_pkey;
ALTER TABLE IF EXISTS ONLY public.classifier_node DROP CONSTRAINT IF EXISTS classifier_node_name_key;
ALTER TABLE IF EXISTS public.product ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.classifier_node ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.product_id_seq;
DROP TABLE IF EXISTS public.product;
DROP SEQUENCE IF EXISTS public.classifier_node_id_seq;
DROP TABLE IF EXISTS public.classifier_node;
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 210 (class 1259 OID 16454)
-- Name: classifier_node; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.classifier_node (
    id integer NOT NULL,
    parent_id integer,
    name text NOT NULL,
    unit text,
    sort_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.classifier_node OWNER TO postgres;

--
-- TOC entry 209 (class 1259 OID 16453)
-- Name: classifier_node_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.classifier_node_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.classifier_node_id_seq OWNER TO postgres;

--
-- TOC entry 3413 (class 0 OID 0)
-- Dependencies: 209
-- Name: classifier_node_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.classifier_node_id_seq OWNED BY public.classifier_node.id;


--
-- TOC entry 212 (class 1259 OID 16471)
-- Name: product; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product (
    id integer NOT NULL,
    classifier_node_id integer NOT NULL,
    sku character varying(100),
    name text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    price integer NOT NULL,
    supplier text NOT NULL,
    weight_gram integer NOT NULL
);


ALTER TABLE public.product OWNER TO postgres;

--
-- TOC entry 211 (class 1259 OID 16470)
-- Name: product_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.product_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.product_id_seq OWNER TO postgres;

--
-- TOC entry 3414 (class 0 OID 0)
-- Dependencies: 211
-- Name: product_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.product_id_seq OWNED BY public.product.id;


--
-- TOC entry 3251 (class 2604 OID 16457)
-- Name: classifier_node id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classifier_node ALTER COLUMN id SET DEFAULT nextval('public.classifier_node_id_seq'::regclass);


--
-- TOC entry 3253 (class 2604 OID 16474)
-- Name: product id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product ALTER COLUMN id SET DEFAULT nextval('public.product_id_seq'::regclass);


--
-- TOC entry 3405 (class 0 OID 16454)
-- Dependencies: 210
-- Data for Name: classifier_node; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.classifier_node VALUES (2, 1, 'Варёные', 'грамм', 1);
INSERT INTO public.classifier_node VALUES (3, 1, 'Копчёные', 'грамм', 2);
INSERT INTO public.classifier_node VALUES (4, 1, 'Цельномышечные', 'грамм', 3);
INSERT INTO public.classifier_node VALUES (5, 2, 'Варёная колбаса', 'грамм', 1);
INSERT INTO public.classifier_node VALUES (6, 2, 'Ливерные продукты', 'грамм', 2);
INSERT INTO public.classifier_node VALUES (7, 3, 'Варёно-копчёные', 'грамм', 1);
INSERT INTO public.classifier_node VALUES (8, 3, 'Полу-копчёные', 'грамм', 2);
INSERT INTO public.classifier_node VALUES (9, 3, 'Сырокопчёные', 'грамм', 3);
INSERT INTO public.classifier_node VALUES (10, 4, 'Ветчина', 'грамм', 1);
INSERT INTO public.classifier_node VALUES (11, 4, 'Карбонат', 'грамм', 2);
INSERT INTO public.classifier_node VALUES (12, 5, 'Высшего сорта', 'грамм', 1);
INSERT INTO public.classifier_node VALUES (13, 5, 'Сосиски/сардельки', 'грамм', 2);
INSERT INTO public.classifier_node VALUES (14, 5, 'Зельц', 'грамм', 3);
INSERT INTO public.classifier_node VALUES (15, 6, 'Ливерная колбаса', 'грамм', 1);
INSERT INTO public.classifier_node VALUES (16, 6, 'Паштет', 'грамм', 2);
INSERT INTO public.classifier_node VALUES (17, 9, 'Салями', 'грамм', 1);
INSERT INTO public.classifier_node VALUES (18, 9, 'Чоризо', 'грамм', 2);
INSERT INTO public.classifier_node VALUES (19, 10, 'Ветчина варёная', 'грамм', 1);
INSERT INTO public.classifier_node VALUES (20, 10, 'Буженина', 'грамм', 2);
INSERT INTO public.classifier_node VALUES (22, 1, 'Хлебная колбаса', 'грамм', 4);
INSERT INTO public.classifier_node VALUES (1, NULL, 'Колбасное изделие', 'грамм', 0);
INSERT INTO public.classifier_node VALUES (21, NULL, 'Лес', 'грамм', 1);


--
-- TOC entry 3407 (class 0 OID 16471)
-- Dependencies: 212
-- Data for Name: product; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.product VALUES (1, 5, 'Колбаса варёная Клинский Докторская категория А', 'Колбаса докторская Клинская', '2026-04-10 15:36:16.84588', 499, 'ОАО «Мясокомбинат Клинский»', 400);
INSERT INTO public.product VALUES (2, 5, '«Докторская» ГОСТ, колбаса вареная в целлофане', 'Колбаса варёная', '2026-04-10 15:36:16.84588', 1238, '«Окраина»', 1150);
INSERT INTO public.product VALUES (3, 5, '«Любительская» ГОСТ, колбаса вареная', 'Колбаса варёная', '2026-04-10 15:36:16.84588', 158, '«Раменский деликатес»', 200);
INSERT INTO public.product VALUES (4, 15, 'Колбаса ливерная «Ближние Горки» Яичная ГОСТ', 'Колбаса ливерная «Ближние Горки» Яичная', '2026-04-10 15:36:16.84588', 139, 'ОАО «Мясокомбинат Клинский»', 300);
INSERT INTO public.product VALUES (5, 15, 'Колбаса «Атяшево» Ливерная Печеночная', 'Колбаса ливерная печеночная', '2026-04-10 15:36:16.84588', 100, '«Атяшево»', 250);
INSERT INTO public.product VALUES (6, 15, 'Колбаса ливерная «Микоян» Традиционная', 'Колбаса ливерная традиционная', '2026-04-10 15:36:16.84588', 113, '«Раменский деликатес»', 400);


--
-- TOC entry 3415 (class 0 OID 0)
-- Dependencies: 209
-- Name: classifier_node_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.classifier_node_id_seq', 7, true);


--
-- TOC entry 3416 (class 0 OID 0)
-- Dependencies: 211
-- Name: product_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.product_id_seq', 1, false);


--
-- TOC entry 3256 (class 2606 OID 16464)
-- Name: classifier_node classifier_node_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classifier_node
    ADD CONSTRAINT classifier_node_name_key UNIQUE (name);


--
-- TOC entry 3258 (class 2606 OID 16462)
-- Name: classifier_node classifier_node_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classifier_node
    ADD CONSTRAINT classifier_node_pkey PRIMARY KEY (id);


--
-- TOC entry 3260 (class 2606 OID 16479)
-- Name: product product_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_pkey PRIMARY KEY (id);


--
-- TOC entry 3262 (class 2606 OID 16481)
-- Name: product product_sku_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_sku_key UNIQUE (sku);


--
-- TOC entry 3263 (class 2606 OID 16465)
-- Name: classifier_node classifier_node_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classifier_node
    ADD CONSTRAINT classifier_node_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.classifier_node(id) ON DELETE RESTRICT;


--
-- TOC entry 3264 (class 2606 OID 16482)
-- Name: product product_classifier_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_classifier_node_id_fkey FOREIGN KEY (classifier_node_id) REFERENCES public.classifier_node(id) ON DELETE RESTRICT;


-- Completed on 2026-04-14 03:41:20 MSK

--
-- PostgreSQL database dump complete
--

\unrestrict s5s5zRhMnUGxS1KjYzdOWUt7zv522ztwFpfV5w1LxWeenTeMlmSZRNOsUqb5rUu

