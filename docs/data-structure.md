## Accessing data

Under development...

| **↓ Context \ Data →**                       | global variables |                 **props**                 |       **x-data**       |      **x-ref**       |       **host**       | **root** |
| :------------------------------------------- | ---------------- | :---------------------------------------: | :--------------------: | :------------------: | :------------------: | :------: |
| **{{handlebars}}**                           | {{**var*}}       |              (use directly)               |         xdata          |          –           |          –           |    –     |
| **component script module**                  | (use directly)   |                host.props                 |         xdata          |         xref         |         host         |   root   |
| **on[event] attributes** <br />onclick="..." | (use directly)   | this.props<br />~*functionName*(), ~*var* | this.xdata<br />~xdata | this.xref<br />~xref | this.host<br />~host |    –     |
| **Alpine attributes** <br />x-text="..."     | (use directly)   |                  $props                   |     (use directly)     |        $refs         |        $host         |    –     |