[![CI](https://github.com/zawataki/google-maps-list-migration/actions/workflows/main.yml/badge.svg)](https://github.com/zawataki/google-maps-list-migration/actions/workflows/main.yml)

# 概要
Googleマップの保存済みのリストを別のアカウントのリストへインポートする。
メモも一緒にインポートされる。
対応しているインポート先のリストは以下の通り。
- お気に入り
- 行ってみたい
- 旅行プラン
- スター付き
- ユーザが作成したリスト（指定した名前のリストが存在しない場合は自動で作成される）

処理時間はリストに保存されている場所1件につき、約6~8秒かかる。  
最初の1件は、Googleアカウントへのログイン処理があるため、20秒ほどかかる。

# 使い方
1. 保存済みのリストをエクスポートする
   1. エクスポートしたいリストがあるGoogleアカウントでログインする
   2. https://takeout.google.com/settings/takeout へアクセスする
   3. `Saved`を選択してエクスポートする
   4. エクスポートが完了するのを待つ（データ量が少なければ数分で終わる）
   5. エクスポートしたzipファイルを展開する
   6. 展開されたディレクトリに含まれる `お気に入りの場所.csv` または `行ってみたい.csv` というファイルのパスをコピーする
2. エクスポートしたファイルをインポートする
   1. コマンドを実行する（インポートしたいアカウントに二要素認証を設定している場合、実行中に1回だけ二要素認証が要求される）
      > 例1：インポートしたいアカウントのGmailアドレスが`example@gmail.com`、パスワードが`foo`、"お気に入りの場所.csv"のパスが `/tmp/保存済み/お気に入りの場所.csv` の場合、以下のコマンドを実行する。
      > ```javascript
      > node import-list.js "/tmp/保存済み/お気に入りの場所.csv" --email example@gmail.com --pass foo
      > ```

      > 例2："行ってみたい"リストへインポートする場合、`--type want-to-go`オプションを指定する。
      > ```javascript
      > node import-list.js "/tmp/保存済み/行ってみたい.csv" --email example@gmail.com --pass foo --type want-to-go
      > ```

      > 上記以外の例や使い方については、`node import-list.js -h` を参照
3. 完了
