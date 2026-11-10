# WF-B BC06〜11：Initial内部型・live参照固定化・全前段検査

Date: 2026-11-10 / 基準HEAD: `435b348` / 未コミット差分の合成検証。

対象は[live slot／bundle設計§11](BEST_PRACTICE_WFB_BODY_LIVE_SLOT_BUNDLE_DESIGN.md)と[構築設計§13](BEST_PRACTICE_WFB_BODY_SLOT_CONSTRUCTION_DESIGN.md)。開始時の作業ツリーはクリーン。文書のコミット時点を区別した既存レビュー修正`435b348`も保持する。正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。本検証では実接続・実通信・設定変更は行わず、作成時点では未コミット・Pushなし。

## 実装範囲

package除外のcomposition fixtureへ固定合成入口createProbeBodyLiveFakeを追加した。同既存root／start／binding／cells／RunLink／duty／exit anchorと先行shell／13carrierを再利用し、構築保護区間のBC05後からBC06〜11へ進む。旧seedのheld後再開／第2prepareではない。BC06 progress、BC07 closure、BC08診断参照、BC09退役storage、BC10候補なしterminal、BC11 unwind初期storageは専用brandと厳密Initial値だけを持つ。

producer返却物をissuedへ即時保持後、brand／binding参照と退出候補3fieldをnon-writable／non-configurableへ固定し、進行fieldはwritableのまま全shapeをsealする。同current保持後に全key・data descriptor・Initial値／同参照を照合し、初回rejectedを保持する。将来の進行writer／実行状態unionは追加しない。旧BC01〜05の全freezeと旧空suffix検査は不変。

各producer前には元base未使用、全前段confirmed／予約／call境界・issued=current／rejectedなし・全data、対象と全suffixの空を確認する。BC11後も全再検査する。正常はlive_held／ok=false、root／shell ready=false、bind未試行／body borrowなし、carrier12／13空である。公開model=wfb-body-live-initial-1の固定値だけを返し、参照・symbol・関数・raw例外を返さない。

失敗は元root failureと最初のBC位置・全prefix・未捕捉責務を残す。BC08へ構築失敗をbody throw／cancel理由として書き込まず、再prepare／closeで元固定返答を保持する。BC12／13・bundle／draft生成・BD／構築ready・BA／body・BU実操作・正式証拠・実会計は未接続。旧start.request／回収claim・clear／discard／owner解放も追加しない。

## 検証結果

| 検証 | 結果 |
|---|---|
| 新probe-body-live | 193件成功 |
| 関連26ファイル | 2,084件成功、失敗0 |
| 新compiled-probe-body-live | exit 0。field56、brand／copy／固定参照／writable各6、全前段stage45／identity45、preflight7、型拒否19 |
| 旧compiled17本 | 全てexit 0 |
| composition＋新旧body試験のstrict TypeScript | exit 0 |
| build | exit 0 |
| 全体lint（既存設定のsrc／tests） | exit 0、error 0・既存warning 374。今回の新fixture／試験とcomposition本体はerror／warning 0 |
| 梱包dry-run（offline・ignore-scripts） | exit 0、441ファイル、src／testsと今回のfixture混入0。archive生成／公開なし |
| 文書整合 | 更新設計／検証3文書のローカルリンク16件・表15件・末尾改行／空白・LB01〜12に異常なし |

関連試験は[旧seed検証記録](E2E_BEST_PRACTICE_WFB_BODY_SLOT_SEED_2026-11-10.md)に列挙した25ファイルとprobe-body-liveを`bdo npx --no-install vitest run`へ明示した。全repositoryのvitest回帰は今回未実施。期限・並列度を変更していない。

compiledはprobe-body-live／probe-body-seed／probe-local-exit／probe-exit-guard／probe-exit-preparation／probe-grant-capture／probe-run-preparation／probe-frame-preparation／canonical-gate-draft／canonical-supply-construction／journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-start／pending-binding／pending-construction／declared-actualの18本を`bdo node tests/review/fixtures/compiled-<name>.mjs`で実行した。

strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/fixtures/snapshot-read-composition-fake.ts tests/review/probe-body-live.test.ts tests/review/probe-body-seed.test.ts`。buildは`bdo npm run build`。lintは`bdo proxy ./node_modules/.bin/eslint src tests --format json`を集計した。梱包一覧は一時cacheを指定した`bdo proxy npm pack --dry-run --json --ignore-scripts --offline`で確認し、cacheはfinallyで除去した。

## 合成期待値とcompiled対照

新vitestは193件。正常1、全field56＋brand／extra／copy／getter／missing／prototype／freeze／mutable_ref／unsealed各6の110、生成境界と固定化substepの73、producer throw6、close／再入の有限loop各1、hostile入力／閉鎖経路1である。境界oracleは本体のfield／schedule配列をimportせず、既知の固定field数3／3／4／4／9／8（brandと候補の固定undefinedを含む）と6境界＋sealから73位置を列挙する。生成前・予約のみ・issuedのみ・current／provisional・confirmedと未生成suffixを独立比較する。

compiledは56fieldの関係節を各1つ外し、対応するmalformed候補が拒否からlive_heldへ変わることを確認する。brand／同値copy／固定参照descriptor／progress writableの各6対照、全45前段位置のstageとcurrent同一性、base／対象空／suffix／最終検査7対照を持つ。前段copyは後段の直接child照合でも拒否され得るため、検査除去時は「当該producer前の最初の拒否位置が失われる」ことを条件とし、後段失敗で元検査を保証しない。

issued捕捉直後のfaultで保持を確認し、捕捉代入を除いた変異で保持消失を検出する。固定参照への実書込みはTypeError／construction_unconfirmed、進行fieldへの試験書込みは次phaseのInitial関係検査でbinding_mismatchとなる。初回rejectedとcurrentの同参照、BC08生成後の元state_invalidをcatch／closeが上書きしないことも確認する。変異は一時scratch限定、finallyで除去する。

semantic compile-failは19行で、各Initial値の不正variant、grant側not_calledとの混同、候補／commit／実行状態／関数field、異なるpin型、各readonly参照の書換えを拒否する。TypeScript構造型だけで同値copyを拒否できるとは主張せず、runtime同一性対照で補う。

## 初回失敗・訂正の履歴

1. 最初の正常試験は新factory未実装のTypeErrorで失敗（RED）。合成専用入口・Initial型・固定化を追加後に成功（GREEN）。次のpin混入試験はscript未受付のinput_rejectedで失敗（RED）、固定producer故障scriptとstrict拒否を追加後に成功（GREEN）。
2. 拡充後の新193件のうち1件は生成前closeにfirst=closedを期待して失敗した。既存root契約では構築未開始のcloseはfirst=none／disposition=closedであり、旧seedも同じである。製品／既存rootを変更せず、試験期待値を訂正した。
3. 初回compiledは前段copy検査除去後に必ずlive_heldとなることを期待して失敗した。context／pinのcopyは後段の直接child照合にもかかるため、最初の拒否phase／boundaryが変わることを検証する契約へ訂正した。検査を削除しても同じ位置で拒否するなら不合格のままである。
4. 次のcompiledはbase故障注入が効かず失敗した。baselineと同じbase.jsを再importし、ESM cacheが元moduleを返していたのが原因。preflight固有名へ変更し、loaderへmodule URLの重複拒否を追加した。runtimeのguard・期限・期待する拒否位置は緩めていない。
5. 最初の梱包監査は広すぎるcomposition-fake名の検出で、既存配布物review-composition-fake-ioの4ファイルを今回のfixture混入と誤判定した。元から追跡されている製品moduleであり、対象fixtureの正確なbasenameとsrc／tests境界で分類し直す。配布設定や既存moduleは変更しない。

## 保証の限界

LB01〜12のBC06〜11構築部分だけが対象。BC12／13・bind／構築ready・body／unwind・実予算更新・実通信の保証は含まない。元baseのcapture試行0・exit slot照合・matchesRunの単独感度は既存レビューと同じく未対照。constructor以前の失敗・実OOMの診断必着、全guard数／unit係数・実E／S／layout／GC・全体work上界はUnknown。

固定化substepの論理位置は73点まで検証するが、これを実heap allocation数やwork capへ昇格しない。公開inspect／拒否の任意回数全体も有限workとは主張しない。保持はcleanup確認／解放済みではなく、将来の責務解消契約まで同rootへ未確認責務を残すことを意味する。

## レビュー修正（2026-11-10）

基準HEADは`14de3f7`。修正前の全体検証は、lint・build・梱包分類・全vitest（332ファイル17,331件成功・失敗0）・compiled5本（body-live／body-seed／local-exit／declared-actual／canonical-gate-draft）・差分空白検査のすべてが成功した。

一時mutant17種を流した。修正前のkillは次の6種だった。

- vitestで3種：fixループの短縮、返答cache、seal抜き
- compiledだけで3種：rejected節、前段のreserved／call、rejectedの差替え
  - 訂正（`29c53e1`のレビュー）：このうち`bodyLiveDataMatches`のrejected節は、外部mutantが既存copy対照のanchorも消したためにcompiledが止まったもので、意味上のkillではない。rejectedが付くのは不一致でfailした時だけで構築はそこで止まるため、「rejected付きで正規」という状態は作れない。等価な防御条件と記録し直す。

11種は両方で生存した。

- live経路の`bodyLivePrefixMatches`の5種：shellのfailure同一性・building state・shape、carrierのshape／index／kind、後段のissued／current／rejected空。seed側の同型検査への対照は別関数なので効かない。
- descriptor／sealの3種：`isSealed`、`enumerable===true`、`configurable===false`。isSealedとconfigurableは互いを覆い隠し、enumerableとisSealedを単独で破るfaultもなかった。
- inspectのprojectionの3種：phase allowlist、`live[].initial`、`live[].sealed`。

修正として次を追加した。

- compiledの単独注入9件（`livePrefixControls`）。BC08 beforeへの単一注入を、`bodyLivePrefixMatches`の当該節が最初に`binding_mismatch`で拒否することを確認する。節を外すと拒否位置が移るか、live_heldになる。
- 非列挙の進行field対照。`enumerable`節だけが拒否する。
- 拡張可能かつ全property non-configurableの値の対照。`isSealed`節だけが拒否する。
- 許可外phaseを`unconfirmed`と投影する対照。
- vitestのmix試験で、不正currentを保持する`live[]`の`initial=false`と、未sealのときの`sealed=false`、それ以前のliveが`initial`かつ`sealed`であることを確認する。

RED／GREEN：修正前は上記11種が両方で生存した（RED）。修正後は10種がkillされた（GREEN）。

- vitestで2種（initial／sealed projection）。
- compiledで8種。いずれも外部mutantが新対照の注入済みsourceへの期待値assertで落ちることを確認した。anchor消失による停止ではない。

残る1種の`configurable===false`は、own data propertyではisSealedに包含されるため等価とした。修正後の全体検証も、lint・build・梱包分類・全vitest・compiled5本・差分空白検査のすべてが成功した。

## コミット前の対象限定再検証（2026-11-10）

対象9ファイルだけをindexへ登録し、indexの全追跡ファイルを新しい一時フォルダへ展開して再検証した。依存は既存のローカルnode_modulesを参照し、導入／取得は行っていない。未登録・未追跡の作業中変更をコピーせず、対象9件の内容がindexとbyte単位で一致することも確認した。

同コピーでbuild・strict TypeScript・関連26ファイル2,084件・compiled18本が全てexit 0。lintはerror 0／既存warning 374、offlineの梱包dry-runは441ファイル・今回のfixture混入0。設計／検証3文書のリンク16件・表15件と差分空白も確認した。全repositoryのvitest回帰は今回未実施であり、上記の対象範囲を広げて主張しない。

本節の追記は検証記録のみで、検証済みのコード／試験／設定は変更していない。コミット直前時点の記録として、正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持し、実接続・実通信・設定変更・Pushなし。
