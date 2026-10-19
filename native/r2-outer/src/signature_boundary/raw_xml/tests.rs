use super::*;
use std::cell::Cell;
fn envelope(xml: &[u8]) -> Vec<u8> {
    let mut out = 0xfade7171u32.to_be_bytes().to_vec();
    out.extend_from_slice(&u32::try_from(xml.len() + 8).unwrap().to_be_bytes());
    out.extend_from_slice(xml);
    out
}
fn document(body: &str) -> Vec<u8> {
    envelope(format!("<plist version=\"1.0\"><dict>{body}</dict></plist>").as_bytes())
}
fn observation(entries: Vec<(&str, ObservedValue)>) -> Observation {
    Observation {
        representation: Representation::Dictionary(
            entries.into_iter().map(|(k, v)| (k.into(), v)).collect(),
        ),
        blob_bytes: 0,
    }
}
fn bools(entries: &[(&str, bool)]) -> Observation {
    observation(
        entries
            .iter()
            .map(|(k, v)| (*k, ObservedValue::Boolean(*v)))
            .collect(),
    )
}
fn run(blob: &[u8], obs: &Observation) -> Result<ApiXmlMatch, Rejection> {
    compare(Some(blob), obs, Instant::now(), &AtomicBool::new(false))
}
#[test]
fn api_xml_matches_typed_dictionary_in_any_key_order_without_authority() {
    let b = document("<key>B</key><false/><key>A</key><true/>");
    let result = run(&b, &bools(&[("A", true), ("B", false)])).unwrap();
    assert_eq!(result.key_count, 2);
    assert_eq!(
        format!("{result:?}"),
        "ApiXmlMatch(api_only_not_execution_authority)"
    );
}
#[test]
fn empty_dictionary_is_not_absence_and_both_empty_forms_are_supported() {
    for xml in [
        "<plist version='1.0'><dict/></plist>",
        "<plist version='1.0'><dict /></plist>",
        "<plist version='1.0'><dict></dict></plist>",
    ] {
        assert_eq!(
            run(&envelope(xml.as_bytes()), &bools(&[]))
                .unwrap()
                .key_count,
            0
        );
    }
}
#[test]
fn xml_declaration_attribute_spacing_quotes_and_nonselfclosing_booleans() {
    for xml in [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<plist version=\"1.0\">\n<dict><key>A</key><true></true></dict></plist>\n",
        "<?xml version = '1.0'?>\n<plist\tversion = '1.0' ><dict ><key >A</key ><true /></dict ></plist >",
    ] {
        assert!(run(&envelope(xml.as_bytes()), &bools(&[("A", true)])).is_ok());
    }
}
#[test]
fn false_is_retained_and_compared_as_false_not_an_empty_or_true_value() {
    let b = document("<key>A</key><false></false>");
    assert!(run(&b, &bools(&[("A", false)])).is_ok());
    assert_eq!(
        run(&b, &bools(&[("A", true)])).unwrap_err(),
        Rejection::RepresentationMismatch
    );
    assert_eq!(
        run(&b, &bools(&[])).unwrap_err(),
        Rejection::RepresentationMismatch
    );
}
#[test]
fn standard_and_numeric_entities_decode_once_in_keys() {
    let b = document("<key>&amp;&lt;&gt;&quot;&apos;&#65;&#x42;&#x1F600;&amp;lt;</key><true/>");
    assert!(run(&b, &bools(&[("&<>\"'AB😀&lt;", true)])).is_ok());
}
#[test]
fn duplicate_keys_are_rejected_before_map_collapse_after_entity_decoding() {
    for body in [
        "<key>A</key><true/><key>A</key><false/>",
        "<key>A</key><true/><key>&#65;</key><true/>",
    ] {
        assert_eq!(
            run(&document(body), &bools(&[("A", true)])).unwrap_err(),
            Rejection::DuplicateKey
        );
    }
}
#[test]
fn dictionary_duplicate_and_invalid_keys_are_not_coerced() {
    let b = document("<key>A</key><true/>");
    assert_eq!(
        run(&b, &bools(&[("A", true), ("A", true)])).unwrap_err(),
        Rejection::DuplicateKey
    );
    for key in ["", "A\n", "A\0", "\u{fffe}"] {
        assert_eq!(
            run(&b, &bools(&[(key, true)])).unwrap_err(),
            Rejection::InvalidDictionary
        );
    }
}
#[test]
fn absent_unknown_or_der_input_never_produces_absence() {
    let started = Instant::now();
    let cancel = AtomicBool::new(false);
    assert_eq!(
        compare(None, &bools(&[]), started, &cancel).unwrap_err(),
        Rejection::AbsenceUnproven
    );
    let b = document("");
    for (representation, error) in [
        (Representation::AbsenceProven, Rejection::AbsenceUnproven),
        (
            Representation::UnsupportedOrUnknown,
            Rejection::UnsupportedRepresentation,
        ),
    ] {
        assert_eq!(
            run(
                &b,
                &Observation {
                    representation,
                    blob_bytes: 0
                }
            )
            .unwrap_err(),
            error
        );
    }
    let mut der = b;
    der[..4].copy_from_slice(&0xfade7172u32.to_be_bytes());
    assert_eq!(
        run(&der, &bools(&[])).unwrap_err(),
        Rejection::UnsupportedRepresentation
    );
}
#[test]
fn envelope_length_endianness_unknown_magic_and_headerless_inputs_stop() {
    let b = document("");
    for raw in [b[..7].to_vec(), b[8..].to_vec(), vec![], vec![0; 8]] {
        assert!(run(&raw, &bools(&[])).is_err());
    }
    for length in [0, 7, (b.len() - 1) as u32, (b.len() + 1) as u32, u32::MAX] {
        let mut raw = b.clone();
        raw[4..8].copy_from_slice(&length.to_be_bytes());
        assert_eq!(
            run(&raw, &bools(&[])).unwrap_err(),
            Rejection::InvalidEnvelope
        );
    }
    let mut raw = b.clone();
    raw[4..8].copy_from_slice(&(b.len() as u32).to_le_bytes());
    assert_eq!(
        run(&raw, &bools(&[])).unwrap_err(),
        Rejection::InvalidEnvelope
    );
    let mut raw = b;
    raw[..4].copy_from_slice(&0x12345678u32.to_be_bytes());
    assert_eq!(
        run(&raw, &bools(&[])).unwrap_err(),
        Rejection::UnsupportedRepresentation
    );
}
#[test]
fn exact_64kib_including_wrapper_is_accepted_but_one_more_is_rejected() {
    let mut xml = "<plist version='1.0'><dict/></plist>".as_bytes().to_vec();
    xml.resize(MAX - 8, b' ');
    assert!(run(&envelope(&xml), &bools(&[])).is_ok());
    xml.push(b' ');
    assert_eq!(
        run(&envelope(&xml), &bools(&[])).unwrap_err(),
        Rejection::Limit
    );
    let mut o = bools(&[]);
    o.blob_bytes = MAX + 1;
    assert_eq!(run(&document(""), &o).unwrap_err(), Rejection::Limit);
}
#[test]
fn key_count_32_and_utf8_bytes_128_are_accepted_but_one_more_is_rejected() {
    let mut body = String::new();
    let keys: Vec<_> = (0..32).map(|i| format!("K{i}")).collect();
    for k in &keys {
        body.push_str(&format!("<key>{k}</key><true/>"));
    }
    let o = bools(&keys.iter().map(|k| (k.as_str(), true)).collect::<Vec<_>>());
    assert_eq!(run(&document(&body), &o).unwrap().key_count, 32);
    body.push_str("<key>EXTRA</key><true/>");
    assert_eq!(run(&document(&body), &o).unwrap_err(), Rejection::Limit);
    let keys: Vec<_> = (0..33).map(|i| format!("K{i}")).collect();
    let o = bools(&keys.iter().map(|k| (k.as_str(), true)).collect::<Vec<_>>());
    assert_eq!(run(&document(""), &o).unwrap_err(), Rejection::Limit);
    for key in ["x".repeat(128), "é".repeat(64)] {
        let b = document(&format!("<key>{key}</key><true/>"));
        assert!(run(&b, &bools(&[(&key, true)])).is_ok());
        let long = format!("{key}x");
        assert_eq!(
            run(&b, &bools(&[(&long, true)])).unwrap_err(),
            Rejection::Limit
        );
        assert_eq!(
            run(
                &document(&format!("<key>{long}</key><true/>")),
                &bools(&[(&key, true)])
            )
            .unwrap_err(),
            Rejection::Limit
        );
    }
}
#[test]
fn dictionary_type_and_value_differences_never_coerce_to_boolean() {
    let b = document("<key>A</key><true/>");
    for v in [
        ObservedValue::Boolean(false),
        ObservedValue::Number,
        ObservedValue::String,
        ObservedValue::Data,
        ObservedValue::Container,
        ObservedValue::Unknown,
    ] {
        assert_eq!(
            run(&b, &observation(vec![("A", v)])).unwrap_err(),
            Rejection::RepresentationMismatch
        );
    }
}
#[test]
fn non_boolean_xml_values_and_nested_structures_are_rejected() {
    for value in [
        "<integer>1</integer>",
        "<string>true</string>",
        "<real>1</real>",
        "<data/>",
        "<array/>",
        "<dict/>",
        "<true> </true>",
        "<true>1</true>",
    ] {
        assert_eq!(
            run(
                &document(&format!("<key>A</key>{value}")),
                &bools(&[("A", true)])
            )
            .unwrap_err(),
            Rejection::InvalidXml
        );
    }
    let deep = format!("{}{}", "<dict>".repeat(20), "</dict>".repeat(20));
    assert!(run(&document(&deep), &bools(&[])).is_err());
}
#[test]
fn all_doctypes_external_entities_comments_cdata_and_unknown_pi_stop() {
    for prefix in [
        "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
        "<!DOCTYPE plist [<!ENTITY x SYSTEM 'file:///PRIVATE_MARKER'>]>",
        "<!DOCTYPE plist [<!ENTITY % p SYSTEM 'https://invalid.example/evil'>%p;]>",
        "<!-- comment -->",
        "<?other x?>",
    ] {
        let b = envelope(format!("{prefix}<plist version='1.0'><dict/></plist>").as_bytes());
        assert!(run(&b, &bools(&[])).is_err());
    }
    for key in [
        "<![CDATA[A]]>",
        "A<!--x-->",
        "A<?other?>",
        "A]]>",
        "&external;",
    ] {
        assert!(
            run(
                &document(&format!("<key>{key}</key><true/>")),
                &bools(&[("A", true)])
            )
            .is_err()
        );
    }
}
#[test]
fn malformed_entities_invalid_unicode_and_control_characters_stop() {
    for key in [
        "&",
        "&amp",
        "&#;",
        "&#x;",
        "&#-1;",
        "&#xD800;",
        "&#0;",
        "&#xFFFE;",
        "&#x110000;",
        "&#42949672960;",
        "&#x9;",
        "\u{85}",
        "\0",
        "A\n",
    ] {
        assert!(
            run(
                &document(&format!("<key>{key}</key><true/>")),
                &bools(&[("A", true)])
            )
            .is_err(),
            "accepted invalid synthetic key"
        );
    }
}
#[test]
fn bom_invalid_utf8_binary_plist_trailing_data_and_nul_are_not_ignored() {
    for bytes in [
        vec![0xff],
        b"\xef\xbb\xbf<plist version='1.0'><dict/></plist>".to_vec(),
        b"bplist00".to_vec(),
        b"<plist version='1.0'><dict/></plist>\0".to_vec(),
        b"<plist version='1.0'><dict/></plist><extra/>".to_vec(),
    ] {
        assert!(run(&envelope(&bytes), &bools(&[])).is_err());
    }
    let mut b = document("");
    b.push(b' ');
    assert_eq!(
        run(&b, &bools(&[])).unwrap_err(),
        Rejection::InvalidEnvelope
    );
}
#[test]
fn attributes_versions_namespaces_and_malformed_closing_tags_are_closed() {
    for xml in [
        "<plist><dict/></plist>",
        "<plist version='2.0'><dict/></plist>",
        "<plist version='1.0' extra='x'><dict/></plist>",
        "<plist version='1.0' version='1.0'><dict/></plist>",
        "<plist version='1.0'><dict extra='x'/></plist>",
        "<p:plist version='1.0'><dict/></p:plist>",
        "<plist version='1.0'><dict></dictfoo></plist>",
        "<?xml version='1.0' encoding='UTF-16'?><plist version='1.0'><dict/></plist>",
        "<?xml version='1.0' standalone='yes'?><plist version='1.0'><dict/></plist>",
        " <?xml version='1.0'?><plist version='1.0'><dict/></plist>",
    ] {
        assert!(run(&envelope(xml.as_bytes()), &bools(&[])).is_err());
    }
}
#[test]
fn keys_are_not_trimmed_case_folded_or_unicode_normalized() {
    for (xmlkey, cfkey) in [(" A ", "A"), ("A", "a"), ("é", "e\u{301}")] {
        assert_eq!(
            run(
                &document(&format!("<key>{xmlkey}</key><true/>")),
                &bools(&[(cfkey, true)])
            )
            .unwrap_err(),
            Rejection::RepresentationMismatch
        );
    }
    assert!(run(&document("<key> A </key><true/>"), &bools(&[(" A ", true)])).is_ok());
}
#[test]
fn missing_extra_or_different_dictionary_keys_are_mismatches() {
    let b = document("<key>A</key><true/>");
    for o in [
        bools(&[]),
        bools(&[("B", true)]),
        bools(&[("A", true), ("B", true)]),
    ] {
        assert_eq!(run(&b, &o).unwrap_err(), Rejection::RepresentationMismatch);
    }
}
#[test]
fn all_truncations_of_a_valid_envelope_or_structure_are_rejected() {
    let b = document("<key>A</key><true/>");
    for end in 0..b.len() {
        assert!(run(&b[..end], &bools(&[("A", true)])).is_err());
    }
    let xml = &b[8..];
    for end in 0..xml.len() {
        assert!(run(&envelope(&xml[..end]), &bools(&[("A", true)])).is_err());
    }
}
#[test]
fn shared_start_expiry_future_start_and_initial_cancel_stop() {
    let b = document("");
    let o = bools(&[]);
    for started in [
        Instant::now() - Duration::from_secs(10),
        Instant::now() + Duration::from_secs(10),
    ] {
        assert_eq!(
            compare(Some(&b), &o, started, &AtomicBool::new(false)).unwrap_err(),
            Rejection::Deadline
        );
    }
    assert_eq!(
        compare(Some(&b), &o, Instant::now(), &AtomicBool::new(true)).unwrap_err(),
        Rejection::Cancelled
    );
}
#[test]
fn deadline_during_key_entity_and_whitespace_scans_is_not_only_checked_at_entry() {
    let started = Instant::now();
    for body in [
        format!(
            "<key>{}</key><true/>",
            "&#00000000000000000000065;".repeat(100)
        ),
        format!("{}<key>A</key><true/>", " ".repeat(30000)),
    ] {
        let b = document(&body);
        let calls = Cell::new(0);
        let now = || {
            calls.set(calls.get() + 1);
            if calls.get() >= 100 {
                started + Duration::from_secs(10)
            } else {
                started
            }
        };
        assert_eq!(
            compare_inner(
                Some(&b),
                &bools(&[("A", true)]),
                started,
                &AtomicBool::new(false),
                &now
            )
            .unwrap_err(),
            Rejection::Deadline
        );
        assert_eq!(calls.get(), 100);
    }
}
#[test]
fn cancellation_during_parse_and_deadline_at_final_validation_stop() {
    let b = document("<key>A</key><true/>");
    let o = bools(&[("A", true)]);
    let started = Instant::now();
    let cancel = AtomicBool::new(false);
    let count = Cell::new(0);
    let normal = || {
        count.set(count.get() + 1);
        started
    };
    assert!(compare_inner(Some(&b), &o, started, &cancel, &normal).is_ok());
    let total = count.get();
    count.set(0);
    let late = || {
        count.set(count.get() + 1);
        if count.get() == total {
            started + Duration::from_secs(10)
        } else {
            started
        }
    };
    assert_eq!(
        compare_inner(Some(&b), &o, started, &cancel, &late).unwrap_err(),
        Rejection::Deadline
    );
    count.set(0);
    let interrupted = || {
        count.set(count.get() + 1);
        if count.get() == 12 {
            cancel.store(true, Ordering::Release);
        }
        started
    };
    assert_eq!(
        compare_inner(Some(&b), &o, started, &cancel, &interrupted).unwrap_err(),
        Rejection::Cancelled
    );
}
#[test]
fn fixed_errors_do_not_echo_xml_markers_or_observation_values() {
    let b = document("<key>PRIVATE_MARKER</key><string>SECRET_VALUE</string>");
    let e = run(&b, &bools(&[("PRIVATE_MARKER", true)])).unwrap_err();
    assert_eq!(format!("{e:?}"), "InvalidXml");
}
