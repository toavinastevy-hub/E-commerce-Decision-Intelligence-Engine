"""
Smoke tests for app.py using Streamlit's built-in headless test runner.
They click the buttons and check that the pages run without errors and show the right numbers.
"""
from pathlib import Path
import pytest
from streamlit.testing.v1 import AppTest

APP = str(Path(__file__).resolve().parent.parent / "app.py")


def fresh():
    return AppTest.from_file(APP, default_timeout=60).run()


def metric(at, label):
    return next(m.value for m in at.metric if m.label == label)


def load_and_confirm(at, button_key):
    at.button(key=button_key).click().run()
    at.button(key="btn_confirm").click().run()
    return at


def test_app_starts_without_errors():
    at = fresh()
    assert not at.exception
    assert any("Choose demo data" in i.value for i in at.info)


def test_dashboard_without_data_shows_guidance():
    at = fresh()
    at.sidebar.radio(key="page").set_value("Dashboard").run()
    assert not at.exception
    assert any("No data confirmed" in i.value for i in at.info)


def test_clean_demo_data_flow_and_dashboard_numbers():
    at = load_and_confirm(fresh(), "btn_demo_clean")
    assert not at.exception
    assert any("SIMULATED" in w.value for w in at.warning)          # simulated data is labelled
    assert len(at.session_state["analysis_df"]) == 13589
    assert len(at.session_state["excluded_df"]) == 0
    at.sidebar.radio(key="page").set_value("Dashboard").run()
    assert not at.exception
    assert metric(at, "Sales after discounts") == "$852,008"
    assert metric(at, "Profit before overheads") == "$324,921"
    assert metric(at, "Profit margin") == "38.1%"
    assert metric(at, "Orders") == "9,132"
    assert metric(at, "Items sold") == "22,716"


def test_dirty_data_excludes_error_rows_and_keeps_them():
    at = load_and_confirm(fresh(), "btn_demo_dirty")
    assert not at.exception
    assert len(at.session_state["excluded_df"]) == 34
    assert len(at.session_state["analysis_df"]) == 13599 - 34
    at.sidebar.radio(key="page").set_value("Dashboard").run()
    assert not at.exception


def test_category_filter_changes_totals():
    at = load_and_confirm(fresh(), "btn_demo_clean")
    at.sidebar.radio(key="page").set_value("Dashboard").run()
    all_rev = metric(at, "Sales after discounts")
    at.sidebar.multiselect(key="f_cats").set_value(["Fitness"]).run()
    assert not at.exception
    assert metric(at, "Sales after discounts") != all_rev


def test_empty_filter_selection_is_handled():
    at = load_and_confirm(fresh(), "btn_demo_clean")
    at.sidebar.radio(key="page").set_value("Dashboard").run()
    at.sidebar.multiselect(key="f_cats").set_value([]).run()
    assert not at.exception
    assert any("No data matches" in w.value for w in at.warning)


# ---------- Phase 5, Step 2: Products and Discounts pages ----------
def test_products_and_discounts_without_data_show_guidance():
    for page in ("Products", "Discounts"):
        at = fresh()
        at.sidebar.radio(key="page").set_value(page).run()
        assert not at.exception
        assert any("No data confirmed" in i.value for i in at.info)


def test_products_page_segment_counts_match_tested_module():
    at = load_and_confirm(fresh(), "btn_demo_clean")
    at.sidebar.radio(key="page").set_value("Products").run()
    assert not at.exception
    assert metric(at, "Star") == "7"
    assert metric(at, "Low performer") == "7"
    assert metric(at, "Niche") == "5"
    assert metric(at, "Core volume") == "3"
    assert metric(at, "Busy but thin") == "2"


def test_products_filter_and_empty_selection():
    at = load_and_confirm(fresh(), "btn_demo_clean")
    at.sidebar.radio(key="page").set_value("Products").run()
    at.sidebar.checkbox(key="p_flagged").check().run()
    assert not at.exception
    at.sidebar.multiselect(key="p_segments").set_value([]).run()
    assert not at.exception
    assert any("No products match" in w.value for w in at.warning)


def test_discounts_page_runs_and_counts_add_up():
    at = load_and_confirm(fresh(), "btn_demo_clean")
    at.sidebar.radio(key="page").set_value("Discounts").run()
    assert not at.exception
    total = sum(int(metric(at, n)) for n in
                ["Discounts pay off", "No clear gain from discounts",
                 "Discounts reduce profit", "Not enough data"])
    assert total == 24


def test_break_even_calculator_cases():
    at = load_and_confirm(fresh(), "btn_demo_clean")
    at.sidebar.radio(key="page").set_value("Discounts").run()
    at.slider(key="calc_discount").set_value(20).run()
    at.slider(key="calc_margin").set_value(50).run()
    assert any("67%" in s.value for s in at.success)          # 0.2 / (0.5 - 0.2) = 66.7%
    at.slider(key="calc_discount").set_value(60).run()
    assert not at.exception
    assert any("No amount of extra volume" in e.value for e in at.error)


def test_products_and_discounts_work_on_dirty_data():
    at = load_and_confirm(fresh(), "btn_demo_dirty")
    for page in ("Products", "Discounts"):
        at.sidebar.radio(key="page").set_value(page).run()
        assert not at.exception


# ---------- Phase 6, Step 1: Simulator page ----------
def open_simulator(button_key="btn_demo_clean"):
    at = load_and_confirm(fresh(), button_key)
    at.sidebar.radio(key="page").set_value("Simulator").run()
    return at


def test_simulator_without_data_shows_guidance():
    at = fresh()
    at.sidebar.radio(key="page").set_value("Simulator").run()
    assert not at.exception
    assert any("No data confirmed" in i.value for i in at.info)


def test_simulator_default_equals_baseline():
    at = open_simulator()
    assert not at.exception
    assert metric(at, "Sales after discounts") == "$852,008"           # same as the Dashboard
    assert metric(at, "Profit before overheads") == "$324,921"
    assert metric(at, "Profit margin") == "38.1%"
    assert metric(at, "Items sold") == "22,716"


def test_simulator_assumptions_change_results():
    at = open_simulator()
    at.slider(key="s_price").set_value(10).run()
    assert not at.exception
    assert metric(at, "Sales after discounts") != "$852,008"
    at.slider(key="s_volume").set_value(50).run()
    assert metric(at, "Items sold") == "34,074"              # 22,716 x 1.5


def test_simulator_elasticity_mode_and_discount():
    at = open_simulator()
    at.radio(key="s_mode").set_value("Estimate it from how strongly customers react to price").run()
    at.checkbox(key="s_setdisc").check().run()
    at.slider(key="s_disc").set_value(20).run()
    assert not at.exception
    assert any("implies a volume change" in m.value for m in at.markdown)


def test_simulator_impossible_discount_shows_no_breakeven_and_empty_selection_is_handled():
    at = open_simulator()
    at.checkbox(key="s_setdisc").check().run()
    at.slider(key="s_disc").set_value(80).run()
    assert not at.exception
    assert any("Break-even point: none" in e.value for e in at.error)
    at.multiselect(key="s_products").set_value([]).run()
    assert not at.exception
    assert any("Select at least one product" in w.value for w in at.warning)


def test_simulator_works_on_dirty_data():
    at = open_simulator("btn_demo_dirty")
    assert not at.exception


# ---------- Phase 6, Step 2: Inventory page ----------
def open_inventory(button_key="btn_demo_clean", demo_inventory=True):
    at = load_and_confirm(fresh(), button_key)
    at.sidebar.radio(key="page").set_value("Inventory").run()
    if demo_inventory:
        at.button(key="btn_inv_demo").click().run()
    return at


def test_inventory_without_sales_data_shows_guidance():
    at = fresh()
    at.sidebar.radio(key="page").set_value("Inventory").run()
    assert not at.exception
    assert any("No data confirmed" in i.value for i in at.info)


def test_inventory_without_inventory_file_explains_what_is_missing():
    at = open_inventory(demo_inventory=False)
    assert not at.exception
    assert any("No inventory data loaded" in i.value for i in at.info)


def test_inventory_demo_counts_and_simulated_label():
    at = open_inventory()
    assert not at.exception
    assert any("SIMULATED" in w.value for w in at.warning)
    assert metric(at, "Stockout risk") == "2"
    assert metric(at, "Excess stock") == "4"
    assert metric(at, "OK") == "18"
    assert metric(at, "Reorder now") == "0"


def test_inventory_assumptions_and_filter_work():
    at = open_inventory()
    at.slider(key="i_excess").set_value(365).run()
    assert not at.exception
    assert metric(at, "Excess stock") == "1"                 # only the 400-day planted product is above 365 days
    at.multiselect(key="i_status").set_value([]).run()
    assert not at.exception
    assert any("No products match" in w.value for w in at.warning)


def test_inventory_works_on_dirty_sales_data():
    at = open_inventory("btn_demo_dirty")
    assert not at.exception


# ---------- Phase 6, Step 3: Recommendations page ----------
def open_recommendations(button_key="btn_demo_clean", with_inventory=True):
    at = load_and_confirm(fresh(), button_key)
    if with_inventory:
        at.sidebar.radio(key="page").set_value("Inventory").run()
        at.button(key="btn_inv_demo").click().run()
    at.sidebar.radio(key="page").set_value("Recommendations").run()
    return at


def test_recommendations_without_sales_data_shows_guidance():
    at = fresh()
    at.sidebar.radio(key="page").set_value("Recommendations").run()
    assert not at.exception
    assert any("No data confirmed" in i.value for i in at.info)


def test_recommendations_with_inventory_counts_and_content():
    at = open_recommendations()
    assert not at.exception
    assert metric(at, "High priority") == "4"
    assert metric(at, "Medium priority") == "3"
    assert metric(at, "Low priority") == "3"
    assert any("SIMULATED" in w.value for w in at.warning)
    titles = [e.label for e in at.expander]
    assert any("Face Moisturizer" in t_ and "[High]" in t_ for t_ in titles)
    body = " ".join(m.value for m in at.markdown)
    for label in ("**Issue:**", "**Evidence:**", "**Proposed action:**", "**Expected benefit:**",
                  "**Risks and assumptions:**", "**Priority:"):
        assert label in body


def test_recommendations_without_inventory_have_no_stock_items():
    at = open_recommendations(with_inventory=False)
    assert not at.exception
    assert any("No usable inventory data" in i.value for i in at.info)
    assert not any("Inventory:" in e.label for e in at.expander)


def test_recommendations_filter_and_dirty_data():
    at = open_recommendations()
    at.multiselect(key="r_priority").set_value(["High"]).run()
    assert not at.exception
    assert all("[High]" in e.label for e in at.expander if e.label.startswith("#"))
    at.multiselect(key="r_priority").set_value([]).run()
    assert any("No recommendations match" in w.value for w in at.warning)
    dirty = open_recommendations("btn_demo_dirty")
    assert not dirty.exception
    assert any("Data quality" in e.label for e in dirty.expander)


# ---------- Phase 7: Executive summary page ----------
def open_executive(button_key="btn_demo_clean", with_inventory=True):
    at = load_and_confirm(fresh(), button_key)
    if with_inventory:
        at.sidebar.radio(key="page").set_value("Inventory").run()
        at.button(key="btn_inv_demo").click().run()
    at.sidebar.radio(key="page").set_value("Executive summary").run()
    return at


def test_executive_without_data_shows_guidance():
    at = fresh()
    at.sidebar.radio(key="page").set_value("Executive summary").run()
    assert not at.exception
    assert any("No data confirmed" in i.value for i in at.info)


def test_executive_with_inventory_shows_kpis_findings_actions_alerts():
    at = open_executive()
    assert not at.exception
    assert metric(at, "Sales after discounts") == "$852,008"
    assert metric(at, "Profit before overheads") == "$324,921"
    assert any("SIMULATED" in w.value for w in at.warning)
    body = " ".join(m.value for m in at.markdown)
    for head in ("Performance, Jan 2025 to Jun 2026", "Growth: latest 6 months", "Concentration of profit",
                 "Margin pressure", "Inventory"):
        assert head in body
    assert len(at.dataframe) >= 2                                   # top actions table and inventory alerts table


def test_executive_without_inventory_still_works_and_explains():
    at = open_executive(with_inventory=False)
    assert not at.exception
    assert any("No usable inventory data" in i.value for i in at.info)
    body = " ".join(m.value for m in at.markdown)
    assert "Inventory." not in body                                  # no inventory finding without inventory data


def test_executive_on_dirty_data_and_recommendations_still_consistent():
    at = open_executive("btn_demo_dirty")
    assert not at.exception
    at.sidebar.radio(key="page").set_value("Recommendations").run()
    assert not at.exception


# ---------- Interface for non-technical users ----------
ALL_PAGES = ["Data", "Executive summary", "Dashboard", "Products", "Discounts",
             "Simulator", "Inventory", "Recommendations"]
TECHNICAL = ["net revenue", "gross profit", "gross margin", "gross sales", "cogs", "elasticity", "kpi"]


def quick_started():
    at = fresh()
    at.button(key="btn_quickstart").click().run()
    return at


def test_one_click_demo_loads_everything_and_opens_the_big_picture():
    at = quick_started()
    assert not at.exception
    assert at.radio(key="page").value == "Executive summary"
    assert metric(at, "Sales after discounts") == "$852,008"
    assert metric(at, "Profit before overheads") == "$324,921"
    assert any("SIMULATED" in w.value for w in at.warning)               # honest labelling stays
    assert len(at.dataframe) >= 2                                          # top actions and stock alerts both show
    at.sidebar.radio(key="page").set_value("Recommendations").run()
    assert metric(at, "High priority") == "4"                              # stock data came with the quick start


def test_menu_uses_everyday_names():
    at = fresh()
    labels = " | ".join(at.sidebar.radio(key="page").options)
    for name in ("Start here", "The big picture", "Explore your sales", "Your products",
                 "Do discounts pay off?", "Try a price change", "Stock check", "What to do next"):
        assert name in labels
    assert at.radio(key="page").value == "Data"                            # internal page names are unchanged


def test_every_page_has_a_banner_and_no_exceptions():
    at = quick_started()
    for pg in ALL_PAGES:
        at.sidebar.radio(key="page").set_value(pg).run()
        assert not at.exception, pg
        assert any('class="hero"' in m.value for m in at.markdown), pg


def test_no_technical_words_on_any_screen():
    at = quick_started()
    for pg in ALL_PAGES:
        at.sidebar.radio(key="page").set_value(pg).run()
        texts = [m.value for m in at.markdown] + [c.value for c in at.caption] + [s.value for s in at.subheader]
        texts += [m.label for m in at.metric] + [s.label for s in at.slider] + [b.label for b in at.button]
        texts += [e.label for e in at.expander] + [r.label for r in at.radio] + [c.label for c in at.checkbox]
        text = " ".join(texts).lower()
        for word in TECHNICAL:
            assert word not in text, f"'{word}' still visible on {pg}"


def test_headline_numbers_have_plain_language_tooltips():
    at = quick_started()
    for m in at.metric:
        assert m.help, f"metric '{m.label}' has no tooltip"
    at.sidebar.radio(key="page").set_value("Products").run()
    assert all(m.help for m in at.metric)
    at.sidebar.radio(key="page").set_value("Inventory").run()
    assert all(m.help for m in at.metric if m.label != "Cash tied up in excess stock (at cost)")


def test_quick_start_after_other_data_replaces_it_cleanly():
    at = load_and_confirm(fresh(), "btn_demo_dirty")
    at.button(key="btn_quickstart").click().run()
    assert not at.exception
    assert metric(at, "Sales after discounts") == "$852,008"               # clean data, not the damaged file


# ---------- Excel template: download and upload through the real app ----------
from pathlib import Path as _Path
from openpyxl import load_workbook as _load_workbook
import datetime as _dt
import io as _io

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _upload(at, key, path_or_bytes, name="my_shop.xlsx"):
    data = path_or_bytes if isinstance(path_or_bytes, bytes) else _Path(path_or_bytes).read_bytes()
    at.file_uploader(key=key).set_value((name, data, XLSX)).run()
    return at


def test_template_download_button_offers_a_valid_workbook():
    at = fresh()
    keys = [getattr(b, "key", None) for b in at.get("download_button")]
    assert "btn_download_template" in keys, keys
    assert (_Path("templates") / "EDIE_data_template.xlsx").exists()
    wb = _load_workbook(_Path("templates") / "EDIE_data_template.xlsx")
    assert wb.sheetnames == ["Read me first", "Sales", "Inventory", "Example"]


def test_uploading_the_filled_template_gives_the_same_results_as_the_demo(demo_workbook_path):
    at = _upload(fresh(), "uploader", demo_workbook_path)
    assert not at.exception
    assert any("Inventory sheet was loaded too" in i.value for i in at.info)
    at.button(key="btn_confirm").click().run()
    assert not at.exception
    at.sidebar.radio(key="page").set_value("Executive summary").run()
    assert metric(at, "Sales after discounts") == "$852,008"
    assert metric(at, "Profit before overheads") == "$324,921"
    assert not any("SIMULATED" in w.value for w in at.warning)            # an uploaded file is not labelled simulated
    at.sidebar.radio(key="page").set_value("Inventory").run()
    assert metric(at, "Stockout risk") == "2"                             # stock came from the workbook's Inventory sheet
    assert not at.exception


def test_uploading_a_workbook_with_mistakes_reports_the_excel_row_numbers():
    wb = _load_workbook(_Path("templates") / "EDIE_data_template.xlsx")
    ws = wb["Sales"]
    rows = [("O1", _dt.date(2026, 3, 1), "P1", "Mug", "Home", 2, 12.5, 0.10, 6.0),
            ("O2", "15/03/2026", "P2", "Cap", "Fashion", 1, 20, 0, 11),          # Excel row 3: date typed as text
            ("O3", _dt.date(2026, 3, 3), "P1", "Mug", "Home", 1, 12.5, 0, 6.0)]
    for i, row in enumerate(rows, start=2):
        for j, v in enumerate(row, start=1):
            ws.cell(row=i, column=j, value=v)
    buf = _io.BytesIO()
    wb.save(buf)
    at = _upload(fresh(), "uploader", buf.getvalue())
    assert not at.exception
    issues = " ".join(str(df.value.to_dict()) for df in at.dataframe)
    assert "Invalid date" in issues and "'3'" in issues                      # row 3, the same row number as in Excel
    at.button(key="btn_confirm").click().run()
    assert not at.exception


def test_uploading_the_blank_template_gives_a_plain_message():
    at = _upload(fresh(), "uploader", _Path("templates") / "EDIE_data_template.xlsx")
    assert not at.exception
    assert any("no data rows" in e.value for e in at.error)


def test_real_upload_replaces_demo_stock_so_real_sales_are_never_mixed_with_demo_stock():
    wb = _load_workbook(_Path("templates") / "EDIE_data_template.xlsx")
    ws = wb["Sales"]
    for i, row in enumerate([("O1", _dt.date(2026, 3, 1), "P1", "Mug", "Home", 2, 12.5, 0.10, 6.0)], start=2):
        for j, v in enumerate(row, start=1):
            ws.cell(row=i, column=j, value=v)
    buf = _io.BytesIO()
    wb.save(buf)
    at = quick_started()                                                      # demo sales AND demo (simulated) stock
    assert at.session_state["inv_simulated"] is True
    at.sidebar.radio(key="page").set_value("Data").run()                      # the upload box is on the Start page
    _upload(at, "uploader", buf.getvalue())
    assert not at.exception
    assert at.session_state["inv_raw"] is None and at.session_state["inv_simulated"] is False


def test_inventory_page_accepts_an_excel_file(demo_workbook_path):
    at = load_and_confirm(fresh(), "btn_demo_clean")
    at.sidebar.radio(key="page").set_value("Inventory").run()
    _upload(at, "inv_uploader", demo_workbook_path, name="stock.xlsx")
    assert not at.exception
    assert metric(at, "Stockout risk") == "2"
    assert not any("SIMULATED" in w.value and "inventory" in w.value.lower() for w in at.warning)
